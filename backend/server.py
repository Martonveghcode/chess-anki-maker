from __future__ import annotations

import base64
import hashlib
import html
import io
import json
import mimetypes
import os
import re
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "backend" / "vendor"
sys.path.insert(0, str(VENDOR))

import genanki  # noqa: E402


HOST = "127.0.0.1"
PORT = 8791
MODEL_ID = 1907222401
MODEL_NAME = "Chess Anki Maker - Basic & Reversed"
# Keep the v3 model and note identities separate so future imports cannot rewrite older trainers.
TRAINER_MODEL_ID = 1908042401
TRAINER_MODEL_NAME = "Chess Anki Maker - Interactive Trainer v3"
MAX_REQUEST_BYTES = 40 * 1024 * 1024
PAGE_CLOSE_GRACE_SECONDS = 2.5


def stop_server(server: ThreadingHTTPServer) -> None:
    server.shutdown()
    server.server_close()
    time.sleep(0.1)
    os._exit(0)


def mark_page_active(server: ThreadingHTTPServer) -> None:
    setattr(server, "last_page_activity", time.monotonic())


def stop_server_if_page_stays_closed(server: ThreadingHTTPServer, closed_at: float) -> None:
    time.sleep(PAGE_CLOSE_GRACE_SECONDS)
    if getattr(server, "last_page_activity", 0.0) > closed_at:
        return
    stop_server(server)


def resource_path(name: str) -> Path:
    bundle = Path(getattr(sys, "_MEIPASS", ROOT))
    bundled = bundle / name
    if bundled.exists():
        return bundled
    return ROOT / name


STATIC_ROOT = resource_path("desktop-dist")


CARD_CSS = r"""
.card { font-family: Arial, sans-serif; font-size: 20px; text-align: center; color: #e9eaec; background: #1c1f24; padding: 20px; }
.cam-prompt { color: #a0a5ad; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 16px; }
.cam-term { font-size: 34px; font-weight: 700; color: #9dc6ad; margin: 14px 0; }
.cam-explanation { max-width: 720px; margin: 16px auto; line-height: 1.5; }
.cam-diagram { max-width: 560px; margin: 20px auto 4px; }
.cam-diagram > img { display: block; width: 100%; height: auto; border-radius: 8px; }
.cam-interactive canvas { width: 100%; height: auto; display: block; border-radius: 8px; background: #111; }
.cam-controls { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; margin-top: 9px; border: 1px solid #3c4149; border-radius: 7px; overflow: hidden; background: #23272d; }
.cam-controls button { border: 0; min-height: 42px; background: #2d3239; color: #f0f1f2; font-size: 24px; cursor: pointer; }
.cam-controls button:active { background: #3a4048; }
.cam-step { color: #c7cacf; font-size: 14px; }
.cam-trainer { max-width: 560px; margin: 18px auto 4px; }
.cam-trainer canvas { display: block; width: 100%; height: auto; border-radius: 8px; background: #111; touch-action: none; cursor: grab; transition: box-shadow .2s ease; }
.cam-trainer canvas:active { cursor: grabbing; }
.cam-trainer-bar { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; margin-top: 10px; min-height: 40px; padding: 7px 8px 7px 12px; border: 1px solid #3c4149; border-radius: 7px; background: #23272d; }
.cam-trainer-status { display: grid; gap: 2px; text-align: left; }
.cam-message { color: #e5e7e9; font-size: 14px; font-weight: 700; }
.cam-progress { color: #969da6; font-size: 11px; }
.cam-reset { min-height: 30px; padding: 5px 11px; border: 1px solid #484e57; border-radius: 5px; background: #30353c; color: #e7e9eb; cursor: pointer; }
.cam-trainer-help { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.cam-trainer-help button { min-width: 82px; min-height: 34px; padding: 6px 13px; border: 1px solid #484e57; border-radius: 6px; background: #30353c; color: #e7e9eb; font-size: 13px; font-weight: 700; cursor: pointer; }
.cam-trainer-help button:active:not(:disabled) { background: #3b4149; }
.cam-trainer-help button:disabled { color: #777e87; cursor: default; opacity: .58; }
.cam-show { border-color: #52705e !important; background: #31483a !important; }
.cam-trainer.is-wrong canvas { box-shadow: 0 0 0 3px rgba(217,79,79,.9), 0 0 24px rgba(217,79,79,.32); }
.cam-trainer.is-correct canvas { box-shadow: 0 0 0 3px rgba(74,174,116,.9), 0 0 24px rgba(74,174,116,.3); }
.cam-trainer.is-complete canvas { box-shadow: 0 0 0 4px rgba(80,190,126,.95), 0 0 34px rgba(80,190,126,.42); animation: cam-finish .8s ease-out; }
.cam-trainer.is-wrong .cam-message { color: #f08080; }
.cam-trainer.is-correct .cam-message, .cam-trainer.is-complete .cam-message { color: #83d2a5; }
@keyframes cam-finish { 0% { filter: brightness(1); } 35% { filter: brightness(1.24) saturate(1.16); } 100% { filter: brightness(1); } }
hr#answer { border: 0; border-top: 1px solid #3a3f47; margin: 24px auto; max-width: 720px; }
.nightMode .card, .night_mode .card { color: #e9eaec; background: #1c1f24; }
@media (prefers-reduced-motion: reduce) { .cam-trainer canvas { transition: none; } .cam-trainer.is-complete canvas { animation: none; } }
"""


INTERACTIVE_SCRIPT = r"""
<script>
(function () {
  var roots = document.querySelectorAll('.cam-interactive[data-payload]');
  var glyphs = {wK:'♚',wQ:'♛',wR:'♜',wB:'♝',wN:'♞',wP:'♟',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'};
  var themes = {
    walnut:{light:'#d8c2a4',dark:'#8a6747',border:'#56402f'},
    graphite:{light:'#aeb2b8',dark:'#5b6068',border:'#3f434a'},
    blue:{light:'#c2ced8',dark:'#5f7d96',border:'#42586b'},
    green:{light:'#d3d8bf',dark:'#71845a',border:'#4d5b3e'},
    sand:{light:'#ead9b5',dark:'#b88b59',border:'#765639'},
    burgundy:{light:'#e0c7bf',dark:'#8e4f55',border:'#60363b'},
    purple:{light:'#d9d0df',dark:'#786789',border:'#50445d'},
    ice:{light:'#dce8e8',dark:'#79a3aa',border:'#4f7379'}
  };
  var styles={classic:{font:'"Segoe UI Symbol","DejaVu Sans"',size:62,line:2.2,blur:1,y:2},clean:{font:'"Segoe UI Symbol","DejaVu Sans"',size:56,line:1.4,blur:0,y:0},glass:{font:'"Segoe UI Symbol","DejaVu Sans"',size:62,line:2.4,blur:9,y:4},staunton:{font:'Georgia,"Segoe UI Symbol",serif',size:61,line:2.5,blur:2,y:2},merida:{font:'"Cambria Math","Segoe UI Symbol"',size:60,line:2,blur:3,y:2},tournament:{font:'"Arial Unicode MS","Segoe UI Symbol"',size:64,line:2.7,blur:2,y:3},minimal:{font:'"Segoe UI Symbol",sans-serif',size:54,line:1,blur:0,y:0},outline:{font:'"Segoe UI Symbol","DejaVu Sans"',size:60,line:4.2,blur:0,y:0}};
  function decode(value) {
    var binary = atob(value), bytes = new Uint8Array(binary.length);
    for (var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function center(square, orientation, size) {
    var files = orientation === 'white' ? ['a','b','c','d','e','f','g','h'] : ['h','g','f','e','d','c','b','a'];
    var ranks = orientation === 'white' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    var cell=size/8;
    return {x:(files.indexOf(square[0])+.5)*cell,y:(ranks.indexOf(Number(square[1]))+.5)*cell};
  }
  function draw(root, data, index) {
    var canvas=root.querySelector('canvas'), ctx=canvas.getContext('2d'), size=640, cell=size/8;
    canvas.width=size; canvas.height=size;
    var frame=data.frames[index], settings=data.settings, theme=themes[settings.boardTheme]||themes.walnut;
    var files=settings.orientation==='white'?['a','b','c','d','e','f','g','h']:['h','g','f','e','d','c','b','a'];
    var ranks=settings.orientation==='white'?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
    ctx.fillStyle=theme.border; ctx.fillRect(0,0,size,size);
    for(var row=0;row<8;row++) for(var col=0;col<8;col++) {
      var square=files[col]+ranks[row], fileIndex='abcdefgh'.indexOf(square[0]), rank=Number(square[1]);
      ctx.fillStyle=(fileIndex+rank)%2===1?theme.light:theme.dark; ctx.fillRect(col*cell,row*cell,cell,cell);
      var piece=frame.position[square];
      if(piece){
        var style=styles[settings.pieceStyle]||styles.classic;
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font=style.size+'px '+style.font;
        ctx.lineWidth=style.line;
        ctx.strokeStyle=piece[0]==='w'?'#272a2f':'#f0f1f2'; ctx.fillStyle=piece[0]==='w'?'#f6f4ee':'#26292f';
        ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=style.blur;ctx.shadowOffsetY=style.y;
        ctx.strokeText(glyphs[piece],col*cell+cell/2,row*cell+cell/2+3); ctx.fillText(glyphs[piece],col*cell+cell/2,row*cell+cell/2+3); ctx.restore();
      }
      ctx.fillStyle='rgba(12,14,17,.68)'; ctx.font='bold 15px Arial';
      if(row===7)ctx.fillText(square[0],col*cell+7,row*cell+cell-7);
      if(col===0)ctx.fillText(square[1],col*cell+7,row*cell+17);
    }
    (frame.arrows||[]).forEach(function(a){
      var from=center(a.from,settings.orientation,size),to=center(a.to,settings.orientation,size),angle=Math.atan2(to.y-from.y,to.x-from.x),head=18+a.width*1.4;
      ctx.save();ctx.globalAlpha=.88;ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.lineWidth=a.width*2.2;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x-Math.cos(angle)*head*.55,to.y-Math.sin(angle)*head*.55);ctx.stroke();
      ctx.beginPath();ctx.moveTo(to.x,to.y);ctx.lineTo(to.x-Math.cos(angle-Math.PI/6)*head,to.y-Math.sin(angle-Math.PI/6)*head);ctx.lineTo(to.x-Math.cos(angle+Math.PI/6)*head,to.y-Math.sin(angle+Math.PI/6)*head);ctx.closePath();ctx.fill();ctx.restore();
    });
    root.querySelector('.cam-step').textContent=(index+1)+' / '+data.frames.length+' · '+(frame.label||'Position');
    root.dataset.index=String(index);
  }
  roots.forEach(function(root){
    if(root.dataset.ready)return;root.dataset.ready='1';
    try {
      var data=decode(root.dataset.payload), index=0; draw(root,data,index);
      root.querySelector('.cam-prev').addEventListener('click',function(e){e.stopPropagation();index=(index-1+data.frames.length)%data.frames.length;draw(root,data,index);});
      root.querySelector('.cam-next').addEventListener('click',function(e){e.stopPropagation();index=(index+1)%data.frames.length;draw(root,data,index);});
    } catch (error) { root.innerHTML='<div class="cam-step">Diagram unavailable</div>'; }
  });
})();
</script>
"""


DIAGRAM_HTML = r"""
<div class="cam-diagram">
{{#DiagramData}}
<div class="cam-interactive" data-payload="{{DiagramData}}">
  <canvas width="640" height="640"></canvas>
  <div class="cam-controls"><button class="cam-prev" type="button">‹</button><span class="cam-step"></span><button class="cam-next" type="button">›</button></div>
</div>
""" + INTERACTIVE_SCRIPT + r"""
{{/DiagramData}}
{{^DiagramData}}{{DiagramImage}}{{/DiagramData}}
</div>
"""


TRAINER_SCRIPT = r"""
<script>
(function () {
  var roots=document.querySelectorAll('.cam-trainer[data-payload]');
  var glyphs={wK:'♚',wQ:'♛',wR:'♜',wB:'♝',wN:'♞',wP:'♟',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'};
  var themes={
    walnut:{light:'#d8c2a4',dark:'#8a6747',border:'#56402f'},graphite:{light:'#aeb2b8',dark:'#5b6068',border:'#3f434a'},
    blue:{light:'#c2ced8',dark:'#5f7d96',border:'#42586b'},green:{light:'#d3d8bf',dark:'#71845a',border:'#4d5b3e'},
    sand:{light:'#ead9b5',dark:'#b88b59',border:'#765639'},burgundy:{light:'#e0c7bf',dark:'#8e4f55',border:'#60363b'},
    purple:{light:'#d9d0df',dark:'#786789',border:'#50445d'},ice:{light:'#dce8e8',dark:'#79a3aa',border:'#4f7379'}
  };
  var styles={classic:{font:'"Segoe UI Symbol","DejaVu Sans"',size:62,line:2.2,blur:1,y:2},clean:{font:'"Segoe UI Symbol","DejaVu Sans"',size:56,line:1.4,blur:0,y:0},glass:{font:'"Segoe UI Symbol","DejaVu Sans"',size:62,line:2.4,blur:9,y:4},staunton:{font:'Georgia,"Segoe UI Symbol",serif',size:61,line:2.5,blur:2,y:2},merida:{font:'"Cambria Math","Segoe UI Symbol"',size:60,line:2,blur:3,y:2},tournament:{font:'"Arial Unicode MS","Segoe UI Symbol"',size:64,line:2.7,blur:2,y:3},minimal:{font:'"Segoe UI Symbol",sans-serif',size:54,line:1,blur:0,y:0},outline:{font:'"Segoe UI Symbol","DejaVu Sans"',size:60,line:4.2,blur:0,y:0}};
  function decode(value){var binary=atob(value),encoded='';for(var i=0;i<binary.length;i++)encoded+='%'+('00'+binary.charCodeAt(i).toString(16)).slice(-2);return JSON.parse(decodeURIComponent(encoded));}
  function copy(value){var result={};for(var key in value)if(Object.prototype.hasOwnProperty.call(value,key))result[key]=value[key];return result;}
  function axes(orientation){return orientation==='white'?{files:['a','b','c','d','e','f','g','h'],ranks:[8,7,6,5,4,3,2,1]}:{files:['h','g','f','e','d','c','b','a'],ranks:[1,2,3,4,5,6,7,8]};}
  function point(square,orientation,size){var a=axes(orientation),cell=size/8;return{x:(a.files.indexOf(square[0])+.5)*cell,y:(a.ranks.indexOf(Number(square[1]))+.5)*cell};}
  function squareAt(canvas,event,orientation){var bounds=canvas.getBoundingClientRect(),a=axes(orientation),col=Math.floor((event.clientX-bounds.left)*8/bounds.width),row=Math.floor((event.clientY-bounds.top)*8/bounds.height);if(col<0||col>7||row<0||row>7)return null;return a.files[col]+a.ranks[row];}
  function drawPiece(ctx,piece,x,y,style){ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=style.size+'px '+style.font;ctx.lineWidth=style.line;ctx.strokeStyle=piece[0]==='w'?'#272a2f':'#f0f1f2';ctx.fillStyle=piece[0]==='w'?'#f6f4ee':'#26292f';ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=style.blur;ctx.shadowOffsetY=style.y;ctx.strokeText(glyphs[piece],x,y+3);ctx.fillText(glyphs[piece],x,y+3);ctx.restore();}
  function draw(root,state,highlights,moving){
    var canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),size=640,cell=size/8,settings=state.data.settings,a=axes(settings.orientation),theme=themes[settings.boardTheme]||themes.walnut,style=styles[settings.pieceStyle]||styles.classic;
    var movingPieces=!moving?[]:(Array.isArray(moving)?moving:[moving]);
    canvas.width=size;canvas.height=size;ctx.fillStyle=theme.border;ctx.fillRect(0,0,size,size);
    for(var row=0;row<8;row++)for(var col=0;col<8;col++){
      var square=a.files[col]+a.ranks[row],fileIndex='abcdefgh'.indexOf(square[0]),rank=Number(square[1]);
      ctx.fillStyle=(fileIndex+rank)%2===1?theme.light:theme.dark;ctx.fillRect(col*cell,row*cell,cell,cell);
      for(var h=0;h<(highlights||[]).length;h++)if(highlights[h].square===square){ctx.fillStyle=highlights[h].color;ctx.fillRect(col*cell,row*cell,cell,cell);}
      var hidden=false;for(var m=0;m<movingPieces.length;m++)if(movingPieces[m].from===square){hidden=true;break;}
      var piece=state.position[square];if(piece&&!hidden)drawPiece(ctx,piece,col*cell+cell/2,row*cell+cell/2,style);
      ctx.fillStyle='rgba(12,14,17,.68)';ctx.font='bold 15px Arial';if(row===7)ctx.fillText(square[0],col*cell+7,row*cell+cell-7);if(col===0)ctx.fillText(square[1],col*cell+7,row*cell+17);
    }
    for(var n=0;n<movingPieces.length;n++)drawPiece(ctx,movingPieces[n].piece,movingPieces[n].x,movingPieces[n].y,style);
  }
  function expected(state,offset){return state.data.frames[state.index+(offset||1)]||null;}
  function helpFrame(state){var frame=expected(state),move=frame&&frame.move;return !state.locked&&!state.complete&&!state.auto&&!state.pointer&&move&&move.color===state.player?frame:null;}
  function updateHelp(root,state){var enabled=!!helpFrame(state);root.querySelector('.cam-hint').disabled=!enabled;root.querySelector('.cam-show').disabled=!enabled;}
  function setStatus(root,state,message,kind){
    root.classList.remove('is-wrong','is-correct');if(kind)root.classList.add(kind);
    root.querySelector('.cam-message').textContent=message;
    root.querySelector('.cam-progress').textContent=state.index+' / '+(state.data.frames.length-1)+' moves';
    updateHelp(root,state);
  }
  function playerFrame(state){var frame=expected(state,state.auto?2:1),move=frame&&frame.move;return move&&move.color===state.player?frame:null;}
  function highlights(state){
    var result=[];
    if(state.hintedFrom)result.push({square:state.hintedFrom,color:'rgba(241,193,72,.58)'});
    if(state.auto){var move=state.auto.frame.move;result.push({square:move.from,color:'rgba(239,196,76,.32)'},{square:move.to,color:'rgba(239,196,76,.5)'});}
    if(state.pointer&&state.pointer.moved)result.push({square:state.pointer.from,color:'rgba(241,193,72,.35)'});
    else if(state.selected)result.push({square:state.selected,color:'rgba(241,193,72,.52)'});
    return result;
  }
  function render(root,state,customHighlights){
    var moving=[];
    if(state.auto&&state.auto.visual)moving.push(state.auto.visual);
    if(state.pointer&&state.pointer.moved)moving.push({from:state.pointer.from,piece:state.pointer.piece,x:state.pointer.x,y:state.pointer.y});
    draw(root,state,customHighlights||highlights(state),moving);
  }
  function finishAuto(root,state,animation){
    if(state.auto!==animation)return;
    if(animation.raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(animation.raf);
    var move=animation.frame.move;
    state.position=copy(animation.frame.position);state.index+=1;state.auto=null;
    render(root,state,[{square:move.from,color:'rgba(239,196,76,.28)'},{square:move.to,color:'rgba(239,196,76,.52)'}]);
    setStatus(root,state,'Opponent moved '+move.from+' → '+move.to,null);
    advance(root,state);
  }
  function startAuto(root,state,frame){
    var move=frame.move,orientation=state.data.settings.orientation,from=point(move.from,orientation,640),to=point(move.to,orientation,640);
    var animation={frame:frame,piece:state.position[move.from]||move.piece,from:from,to:to,startedAt:null,duration:260,progress:0,dragProgress:0,visual:null,raf:0};
    state.hintedFrom=null;
    state.auto=animation;state.selected=null;state.locked=false;setStatus(root,state,'Opponent is moving…',null);
    function tick(now){
      if(state.auto!==animation)return;
      if(animation.startedAt===null)animation.startedAt=now;
      var timed=Math.min(1,(now-animation.startedAt)/animation.duration),progress=Math.max(timed,animation.dragProgress),ease=1-Math.pow(1-progress,3);
      animation.progress=progress;animation.visual={from:move.from,piece:animation.piece,x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease};render(root,state);
      if(progress<1){animation.raf=requestAnimationFrame(tick);return;}
      finishAuto(root,state,animation);
    }
    animation.raf=requestAnimationFrame(tick);
  }
  function commitPlayerMove(root,state,frame){
    state.hintedFrom=null;
    var move=frame.move;state.position=copy(frame.position);state.index+=1;state.selected=null;state.locked=false;
    render(root,state,[{square:move.from,color:'rgba(66,194,117,.26)'},{square:move.to,color:'rgba(66,194,117,.55)'}]);
    advance(root,state);
  }
  function finish(root,state){state.complete=true;state.locked=false;root.classList.remove('is-wrong','is-correct');root.classList.add('is-complete');draw(root,state,[{square:'',color:'transparent'}]);setStatus(root,state,'Line complete',null);root.querySelector('.cam-message').textContent='Line complete';}
  function advance(root,state){
    if(state.index>=state.data.frames.length-1){finish(root,state);return;}
    var frame=expected(state),move=frame&&frame.move;if(!move){state.locked=true;setStatus(root,state,'This line contains an invalid move',null);return;}
    if(move.color!==state.player){startAuto(root,state,frame);return;}
    state.locked=false;setStatus(root,state,'Your move · Play as '+(state.player==='w'?'White':'Black'),null);render(root,state);
  }
  function wrong(root,state,fromSquare,toSquare){
    var piece=state.position[fromSquare];if(!piece)return;var orientation=state.data.settings.orientation,start=point(fromSquare,orientation,640),end=point(toSquare,orientation,640),startTime=null,duration=380,token=++state.wrongToken;
    state.locked=true;state.selected=null;setStatus(root,state,'Wrong — try again','is-wrong');
    function tick(now){if(token!==state.wrongToken)return;if(startTime===null)startTime=now;var progress=Math.min(1,(now-startTime)/duration),travel=progress<.5?progress*2:(1-progress)*2;draw(root,state,[{square:fromSquare,color:'rgba(218,65,65,.35)'},{square:toSquare,color:'rgba(218,65,65,.58)'}],{from:fromSquare,piece:piece,x:start.x+(end.x-start.x)*travel,y:start.y+(end.y-start.y)*travel});if(progress<1){requestAnimationFrame(tick);return;}state.locked=false;updateHelp(root,state);draw(root,state,[{square:fromSquare,color:'rgba(218,65,65,.22)'}]);setTimeout(function(){if(token===state.wrongToken){root.classList.remove('is-wrong');render(root,state);}},420);}
    requestAnimationFrame(tick);
  }
  function attempt(root,state,fromSquare,toSquare){
    if(state.locked||state.complete)return;var frame=expected(state),move=frame&&frame.move;if(move&&move.color===state.player&&move.from===fromSquare&&move.to===toSquare)commitPlayerMove(root,state,frame);else wrong(root,state,fromSquare,toSquare);
  }
  function selectSquare(root,state,square){
    if(!square||state.locked||state.complete||state.auto)return;
    if(state.selected){if(state.selected===square){state.selected=null;render(root,state);}else{var fromSquare=state.selected;state.selected=null;attempt(root,state,fromSquare,square);}return;}
    if(state.position[square]){state.selected=square;render(root,state);}
  }
  function dragProgress(pointer,state){
    var orientation=state.data.settings.orientation,start=point(pointer.from,orientation,640),end=point(pointer.target,orientation,640),dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy;
    return length?Math.max(0,Math.min(1,((pointer.x-start.x)*dx+(pointer.y-start.y)*dy)/length)):0;
  }
  function reset(root,state){
    if(state.auto&&state.auto.raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(state.auto.raf);
    state.wrongToken+=1;root.classList.remove('is-wrong','is-correct','is-complete');state.index=0;state.position=copy(state.data.frames[0].position);state.selected=null;state.hintedFrom=null;state.pointer=null;state.auto=null;state.locked=false;state.complete=false;draw(root,state,[]);setStatus(root,state,'Get ready',null);advance(root,state);
  }
  function showHint(root,state){var frame=helpFrame(state);if(!frame)return;state.selected=null;state.hintedFrom=frame.move.from;render(root,state);}
  function showMove(root,state){var frame=helpFrame(state);if(!frame)return;state.wrongToken+=1;root.classList.remove('is-wrong');commitPlayerMove(root,state,frame);}
  roots.forEach(function(root){
    if(root.dataset.ready)return;root.dataset.ready='1';
    try{
      var data=decode(root.dataset.payload),canvas=root.querySelector('canvas'),state={data:data,index:0,position:{},selected:null,hintedFrom:null,pointer:null,auto:null,locked:false,complete:false,wrongToken:0,player:data.settings.orientation==='black'?'b':'w'};
      canvas.addEventListener('pointerdown',function(event){
        if(state.locked||state.complete||state.pointer)return;event.preventDefault();
        var square=squareAt(canvas,event,data.settings.orientation),frame=playerFrame(state),move=frame&&frame.move,piece=square&&(state.auto?state.auto.frame.position[square]:state.position[square]);
        if(state.auto&&(!move||square!==move.from||!piece))return;
        if(!piece){selectSquare(root,state,square);return;}
        var bounds=canvas.getBoundingClientRect();state.pointer={id:event.pointerId,from:square,piece:piece,target:move&&move.from===square?move.to:square,startX:event.clientX,startY:event.clientY,x:(event.clientX-bounds.left)*640/bounds.width,y:(event.clientY-bounds.top)*640/bounds.height,moved:false};try{canvas.setPointerCapture(event.pointerId);}catch(ignore){}
      });
      canvas.addEventListener('pointermove',function(event){
        var pointer=state.pointer;if(!pointer||pointer.id!==event.pointerId)return;event.preventDefault();
        var bounds=canvas.getBoundingClientRect();pointer.x=(event.clientX-bounds.left)*640/bounds.width;pointer.y=(event.clientY-bounds.top)*640/bounds.height;if(Math.abs(event.clientX-pointer.startX)+Math.abs(event.clientY-pointer.startY)>7)pointer.moved=true;
        if(pointer.moved&&state.auto)state.auto.dragProgress=Math.max(state.auto.dragProgress,dragProgress(pointer,state));
        if(pointer.moved)render(root,state);
      });
      canvas.addEventListener('pointerup',function(event){
        var pointer=state.pointer;if(!pointer||pointer.id!==event.pointerId)return;event.preventDefault();
        if(state.auto)finishAuto(root,state,state.auto);
        state.pointer=null;var square=squareAt(canvas,event,data.settings.orientation);if(pointer.moved&&square&&square!==pointer.from)attempt(root,state,pointer.from,square);else selectSquare(root,state,pointer.from);
      });
      canvas.addEventListener('pointercancel',function(){state.pointer=null;state.selected=null;render(root,state);});
      root.querySelector('.cam-reset').addEventListener('click',function(event){event.stopPropagation();reset(root,state);});
      root.querySelector('.cam-hint').addEventListener('click',function(event){event.preventDefault();event.stopPropagation();showHint(root,state);});
      root.querySelector('.cam-show').addEventListener('click',function(event){event.preventDefault();event.stopPropagation();showMove(root,state);});
      reset(root,state);
    }catch(error){root.innerHTML='<div class="cam-step">Trainer unavailable</div>';}
  });
})();
</script>
"""


TRAINER_HTML = r"""
<div class="cam-trainer" data-payload="{{TrainerData}}">
  <canvas width="640" height="640" aria-label="Interactive chess training board"></canvas>
  <div class="cam-trainer-bar">
    <div class="cam-trainer-status"><span class="cam-message">Get ready</span><span class="cam-progress"></span></div>
    <button class="cam-reset" type="button">Restart</button>
  </div>
  <div class="cam-trainer-help">
    <button class="cam-hint" type="button">Hint</button>
    <button class="cam-show" type="button">Show</button>
  </div>
</div>
""" + TRAINER_SCRIPT


def build_model() -> genanki.Model:
    return genanki.Model(
        MODEL_ID,
        MODEL_NAME,
        fields=[
            {"name": "Term"},
            {"name": "Explanation"},
            {"name": "DiagramData"},
            {"name": "DiagramImage"},
            {"name": "NormalEnabled"},
            {"name": "ReversedEnabled"},
        ],
        templates=[
            {
                "name": "Normal",
                "qfmt": '{{#NormalEnabled}}<div class="cam-prompt">What does this chess term mean?</div><div class="cam-term">{{Term}}</div>{{/NormalEnabled}}',
                "afmt": '{{#NormalEnabled}}{{FrontSide}}<hr id="answer"><div class="cam-explanation">{{Explanation}}</div>' + DIAGRAM_HTML + "{{/NormalEnabled}}",
            },
            {
                "name": "Reversed",
                "qfmt": '{{#ReversedEnabled}}<div class="cam-prompt">Name the chess idea</div><div class="cam-explanation">{{Explanation}}</div>{{/ReversedEnabled}}',
                "afmt": '{{#ReversedEnabled}}{{FrontSide}}<hr id="answer"><div class="cam-term">{{Term}}</div>' + DIAGRAM_HTML + "{{/ReversedEnabled}}",
            },
        ],
        css=CARD_CSS,
    )


def build_training_model() -> genanki.Model:
    return genanki.Model(
        TRAINER_MODEL_ID,
        TRAINER_MODEL_NAME,
        fields=[
            {"name": "Term"},
            {"name": "Explanation"},
            {"name": "TrainerData"},
        ],
        templates=[
            {
                "name": "Interactive line",
                "qfmt": '<div class="cam-prompt">Play the line</div><div class="cam-term">{{Term}}</div>' + TRAINER_HTML,
                "afmt": '<div class="cam-term">{{Term}}</div><hr id="answer"><div class="cam-explanation">{{Explanation}}</div>',
            },
        ],
        css=CARD_CSS,
    )


def clean_deck_name(value: object) -> str:
    text = str(value or "chess").strip()
    return text[:180] or "chess"


def deck_id(name: str) -> int:
    number = int(hashlib.sha1(("chess-anki-maker:" + name).encode("utf-8")).hexdigest()[:12], 16)
    return 1_000_000_000 + number % 999_000_000


def data_url_bytes(value: object, expected: str) -> bytes:
    if not isinstance(value, str):
        raise ValueError(f"Missing {expected} image")
    match = re.fullmatch(r"data:([^;]+);base64,(.+)", value, flags=re.DOTALL)
    if not match:
        raise ValueError(f"Invalid {expected} image")
    return base64.b64decode(match.group(2), validate=True)


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return slug[:60] or "Chess_Card"


def interactive_payload(data: dict[str, object]) -> str:
    payload = {
        "frames": data.get("frames", []),
        "settings": {
            "orientation": data.get("orientation", "white"),
            "boardTheme": data.get("boardTheme", "walnut"),
            "pieceStyle": data.get("pieceStyle", "classic"),
        },
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def training_payload(data: dict[str, object]) -> str:
    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) < 2:
        raise ValueError("Record at least one move for the training line")
    for index, frame in enumerate(frames[1:], start=1):
        if not isinstance(frame, dict) or not isinstance(frame.get("position"), dict):
            raise ValueError(f"Training move {index} has no board position")
        move = frame.get("move")
        if not isinstance(move, dict):
            raise ValueError(f"Training move {index} is missing")
        if not re.fullmatch(r"[a-h][1-8]", str(move.get("from") or "")) or not re.fullmatch(r"[a-h][1-8]", str(move.get("to") or "")):
            raise ValueError(f"Training move {index} has invalid squares")
        if move.get("color") not in ("w", "b"):
            raise ValueError(f"Training move {index} has an invalid side")
    player = "b" if data.get("orientation") == "black" else "w"
    if not any(isinstance(frame, dict) and isinstance(frame.get("move"), dict) and frame["move"].get("color") == player for frame in frames[1:]):
        raise ValueError(f"Record at least one {'black' if player == 'b' else 'white'} move for you to play")
    payload = {
        "frames": frames,
        "settings": {
            "orientation": data.get("orientation", "white"),
            "boardTheme": data.get("boardTheme", "walnut"),
            "pieceStyle": data.get("pieceStyle", "classic"),
        },
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def versioned_note_id(
    data: dict[str, object],
    *,
    term: str,
    explanation: str,
    deck_name: str,
    card_mode: str,
    normal: bool,
    reversed_card: bool,
    frames: list[object],
) -> str:
    """Keep identical exports stable while giving changed card content a new identity."""
    base_note_id = str(data.get("noteId") or hashlib.sha1(os.urandom(24)).hexdigest())
    identity: dict[str, object] = {
        "term": term,
        "explanation": explanation,
        "deckName": deck_name,
        "cardMode": card_mode,
        "orientation": data.get("orientation", "white"),
        "boardTheme": data.get("boardTheme", "walnut"),
        "pieceStyle": data.get("pieceStyle", "classic"),
        "frames": frames,
    }
    if card_mode != "trainer":
        identity.update(
            {
                "normal": normal,
                "reversed": reversed_card,
                "diagramMode": data.get("diagramMode", "interactive"),
                "gifSpeed": data.get("gifSpeed", 900),
            }
        )
    raw = json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"{base_note_id}:{hashlib.sha1(raw).hexdigest()}"


def make_package(data: dict[str, object]) -> tuple[bytes, str]:
    term_text = str(data.get("term") or "").strip()
    explanation_text = str(data.get("explanation") or "").strip()
    if not term_text or not explanation_text:
        raise ValueError("Term and explanation are required")
    card_mode = str(data.get("cardMode") or "study")
    normal = bool(data.get("normal", True))
    reversed_card = bool(data.get("reversed", True))
    if card_mode != "trainer" and not normal and not reversed_card:
        raise ValueError("Select at least one card direction")
    frames = data.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("Add at least one board state")

    deck_name = clean_deck_name(data.get("deckName"))
    note_id = versioned_note_id(
        data,
        term=term_text,
        explanation=explanation_text,
        deck_name=deck_name,
        card_mode=card_mode,
        normal=normal,
        reversed_card=reversed_card,
        frames=frames,
    )
    with tempfile.TemporaryDirectory(prefix="chess_anki_maker_") as temp_dir:
        temp = Path(temp_dir)
        media_files: list[str] = []
        term = html.escape(term_text)
        explanation = html.escape(explanation_text).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")
        if card_mode == "trainer":
            trainer_data = training_payload(data)
            note = genanki.Note(
                model=build_training_model(),
                fields=[term, explanation, trainer_data],
                tags=["chess_anki_maker", "interactive_chess_trainer"],
                guid=genanki.guid_for("chess-anki-trainer-v3", note_id),
            )
        else:
            diagram_mode = str(data.get("diagramMode") or "interactive")
            digest_source = json.dumps({"term": term_text, "frames": frames, "mode": diagram_mode}, sort_keys=True, ensure_ascii=False).encode("utf-8")
            digest = hashlib.sha1(digest_source).hexdigest()[:10]
            diagram_data = ""
            diagram_image = ""
            if diagram_mode == "interactive":
                diagram_data = interactive_payload(data)
                preview_name = f"cam_{digest}_preview.png"
                preview_path = temp / preview_name
                preview_path.write_bytes(data_url_bytes(data.get("stillDataUrl"), "preview"))
                media_files.append(str(preview_path))
            elif diagram_mode == "gif":
                image_name = f"cam_{digest}.gif"
                image_path = temp / image_name
                image_path.write_bytes(data_url_bytes(data.get("gifDataUrl"), "GIF"))
                media_files.append(str(image_path))
                diagram_image = f'<img src="{image_name}" alt="Animated chess sequence">'
            else:
                image_name = f"cam_{digest}.png"
                image_path = temp / image_name
                image_path.write_bytes(data_url_bytes(data.get("stillDataUrl"), "diagram"))
                media_files.append(str(image_path))
                diagram_image = f'<img src="{image_name}" alt="Chess diagram">'
            note = genanki.Note(
                model=build_model(),
                fields=[term, explanation, diagram_data, diagram_image, "1" if normal else "", "1" if reversed_card else ""],
                tags=["chess_anki_maker"],
                guid=genanki.guid_for("chess-anki-maker", note_id),
            )
        deck = genanki.Deck(deck_id(deck_name), deck_name)
        deck.add_note(note)
        package = genanki.Package(deck)
        package.media_files = media_files
        package_path = temp / "card.apkg"
        package.write_to_file(str(package_path))
        content = package_path.read_bytes()
    return content, f"Chess_{slugify(term_text)}.apkg"


class Handler(BaseHTTPRequestHandler):
    server_version = "ChessAnkiMaker/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def send_bytes(self, content: bytes, content_type: str, status: int = 200, headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_bytes(b'{"ok":true}', "application/json")
            return
        mark_page_active(self.server)
        relative = unquote(path.lstrip("/")) or "index.html"
        candidate = (STATIC_ROOT / relative).resolve()
        try:
            candidate.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not candidate.is_file():
            candidate = STATIC_ROOT / "index.html"
        if not candidate.is_file():
            self.send_bytes(b"App files are missing", "text/plain", 500)
            return
        mime = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_bytes(candidate.read_bytes(), mime)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/page-active":
            mark_page_active(self.server)
            self.send_bytes(b'{"ok":true}', "application/json")
            return
        if path == "/api/page-closed":
            closed_at = time.monotonic()
            self.send_bytes(b'{"ok":true}', "application/json")
            threading.Thread(target=stop_server_if_page_stays_closed, args=(self.server, closed_at), daemon=True).start()
            return
        if path == "/api/shutdown":
            self.send_bytes(b'{"ok":true}', "application/json")
            threading.Thread(target=stop_server, args=(self.server,), daemon=True).start()
            return
        if path != "/api/export":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("Export is too large")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Invalid export data")
            content, filename = make_package(payload)
            self.send_bytes(
                content,
                "application/octet-stream",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        except ValueError as error:
            self.send_bytes(str(error).encode("utf-8"), "text/plain; charset=utf-8", 400)
        except Exception:
            self.send_bytes(b"Could not build the Anki package", "text/plain; charset=utf-8", 500)


def app_is_running() -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/api/health", timeout=0.6) as response:
            return response.status == 200
    except Exception:
        return False


def log_crash() -> None:
    folder = Path(os.getenv("LOCALAPPDATA", Path.home())) / "ChessAnkiMaker"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "app.log").write_text(traceback.format_exc(), encoding="utf-8")


def main() -> None:
    url = f"http://{HOST}:{PORT}/"
    if app_is_running():
        if os.getenv("CHESS_ANKI_MAKER_NO_BROWSER") != "1":
            webbrowser.open(url)
        return
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    if os.getenv("CHESS_ANKI_MAKER_NO_BROWSER") != "1":
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_crash()
