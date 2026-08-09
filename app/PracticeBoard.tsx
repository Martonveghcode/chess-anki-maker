"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { LineFrame, LineMove, SavedLine } from "./line-library";

export type PracticePhase = "ready" | "opponent" | "wrong" | "correct" | "complete";

export type PracticeSnapshot = {
  index: number;
  phase: PracticePhase;
  message: string;
  canBack: boolean;
  canHint: boolean;
};

export type PracticeBoardText = {
  practice: string;
  getReady: string;
  yourMove: string;
  opponentMove: string;
  opponentMoved: string;
  wrongMove: string;
  correctMove: string;
  complete: string;
  invalidMove: string;
  backMove: string;
  restart: string;
  hint: string;
  showMove: string;
};

type Props = {
  line: SavedLine;
  text: PracticeBoardText;
  onUpdate: (snapshot: PracticeSnapshot) => void;
};

type Point = { x: number; y: number };
type Highlight = { square: string; color: string };
type MovingPiece = { from: string; piece: string; x: number; y: number };
type RuntimePointer = {
  id: number;
  from: string;
  piece: string;
  target: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
};
type AutoAnimation = {
  frame: LineFrame;
  piece: string;
  from: Point;
  to: Point;
  startedAt: number | null;
  duration: number;
  dragProgress: number;
  visual: MovingPiece | null;
  raf: number;
};

const SIZE = 640;
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const GLYPHS: Record<string, string> = {
  wK: "♚", wQ: "♛", wR: "♜", wB: "♝", wN: "♞", wP: "♟",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
const THEMES: Record<string, { light: string; dark: string; border: string }> = {
  walnut: { light: "#d8c2a4", dark: "#8a6747", border: "#56402f" },
  graphite: { light: "#aeb2b8", dark: "#5b6068", border: "#3f434a" },
  blue: { light: "#c2ced8", dark: "#5f7d96", border: "#42586b" },
  green: { light: "#d3d8bf", dark: "#71845a", border: "#4d5b3e" },
  sand: { light: "#ead9b5", dark: "#b88b59", border: "#765639" },
  burgundy: { light: "#e0c7bf", dark: "#8e4f55", border: "#60363b" },
  purple: { light: "#d9d0df", dark: "#786789", border: "#50445d" },
  ice: { light: "#dce8e8", dark: "#79a3aa", border: "#4f7379" },
};
const PIECE_RENDERING: Record<string, { font: string; size: number; lineWidth: number; shadowBlur: number; shadowY: number }> = {
  classic: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 62, lineWidth: 2.2, shadowBlur: 1, shadowY: 2 },
  clean: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 56, lineWidth: 1.4, shadowBlur: 0, shadowY: 0 },
  glass: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 62, lineWidth: 2.4, shadowBlur: 9, shadowY: 4 },
  staunton: { font: 'Georgia, "Segoe UI Symbol", serif', size: 61, lineWidth: 2.5, shadowBlur: 2, shadowY: 2 },
  merida: { font: '"Cambria Math", "Segoe UI Symbol"', size: 60, lineWidth: 2, shadowBlur: 3, shadowY: 2 },
  tournament: { font: '"Arial Unicode MS", "Segoe UI Symbol"', size: 64, lineWidth: 2.7, shadowBlur: 2, shadowY: 3 },
  minimal: { font: '"Segoe UI Symbol", sans-serif', size: 54, lineWidth: 1, shadowBlur: 0, shadowY: 0 },
  outline: { font: '"Segoe UI Symbol", "DejaVu Sans"', size: 60, lineWidth: 4.2, shadowBlur: 0, shadowY: 0 },
};

function inferMove(previous: Record<string, string>, next: Record<string, string>): LineMove | null {
  const changed = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const destinations = [...changed].filter((square) => next[square] && next[square] !== previous[square]);
  for (const to of destinations) {
    const piece = next[to];
    const from = [...changed].find((square) => square !== to && previous[square] === piece && next[square] !== piece);
    if (from && piece) return { from, to, color: piece[0] as "w" | "b", piece };
  }
  return null;
}

function moveForFrame(frames: LineFrame[], index: number) {
  if (index <= 0) return null;
  return frames[index].move ?? inferMove(frames[index - 1].position, frames[index].position);
}

class PracticeRuntime {
  canvas: HTMLCanvasElement;
  line: SavedLine;
  text: PracticeBoardText;
  onUpdate: (snapshot: PracticeSnapshot) => void;
  index = 0;
  position: Record<string, string> = {};
  selected: string | null = null;
  hintedFrom: string | null = null;
  pointer: RuntimePointer | null = null;
  auto: AutoAnimation | null = null;
  locked = false;
  complete = false;
  wrongToken = 0;
  motionRaf = 0;
  timers = new Set<number>();
  destroyed = false;
  player: "w" | "b";

  constructor(canvas: HTMLCanvasElement, line: SavedLine, text: PracticeBoardText, onUpdate: (snapshot: PracticeSnapshot) => void) {
    this.canvas = canvas;
    this.line = line;
    this.text = text;
    this.onUpdate = onUpdate;
    this.player = line.orientation === "black" ? "b" : "w";
  }

  start() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.later(() => this.restart(), 0);
  }

  destroy() {
    this.destroyed = true;
    this.cancelMotion();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
  }

  later(callback: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  cancelMotion() {
    if (this.auto?.raf) cancelAnimationFrame(this.auto.raf);
    if (this.motionRaf) cancelAnimationFrame(this.motionRaf);
    this.auto = null;
    this.motionRaf = 0;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
  }

  axes() {
    return this.line.orientation === "white"
      ? { files: FILES, ranks: RANKS }
      : { files: [...FILES].reverse(), ranks: [...RANKS].reverse() };
  }

  point(square: string): Point {
    const axes = this.axes();
    const cell = SIZE / 8;
    return { x: (axes.files.indexOf(square[0]) + 0.5) * cell, y: (axes.ranks.indexOf(Number(square[1])) + 0.5) * cell };
  }

  squareAt(event: PointerEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    const axes = this.axes();
    const col = Math.floor((event.clientX - bounds.left) * 8 / bounds.width);
    const row = Math.floor((event.clientY - bounds.top) * 8 / bounds.height);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return `${axes.files[col]}${axes.ranks[row]}`;
  }

  eventPoint(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * SIZE / bounds.width, y: (event.clientY - bounds.top) * SIZE / bounds.height };
  }

  expected(offset = 1) {
    return this.line.frames[this.index + offset] ?? null;
  }

  helpFrame() {
    const frame = this.expected();
    const move = frame && moveForFrame(this.line.frames, this.index + 1);
    return !this.locked && !this.complete && !this.auto && !this.pointer && move?.color === this.player ? frame : null;
  }

  playerFrame() {
    const offset = this.auto ? 2 : 1;
    const frame = this.expected(offset);
    const move = frame && moveForFrame(this.line.frames, this.index + offset);
    return move?.color === this.player ? frame : null;
  }

  update(message: string, phase: PracticePhase) {
    this.onUpdate({ index: this.index, phase, message, canBack: this.index > 0 || Boolean(this.auto), canHint: Boolean(this.helpFrame()) });
  }

  drawPiece(ctx: CanvasRenderingContext2D, piece: string, x: number, y: number) {
    const style = PIECE_RENDERING[this.line.pieceStyle] ?? PIECE_RENDERING.classic;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${style.size}px ${style.font}`;
    ctx.lineWidth = style.lineWidth;
    ctx.strokeStyle = piece[0] === "w" ? "#272a2f" : "#f0f1f2";
    ctx.fillStyle = piece[0] === "w" ? "#f6f4ee" : "#26292f";
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = style.shadowBlur;
    ctx.shadowOffsetY = style.shadowY;
    ctx.strokeText(GLYPHS[piece], x, y + 3);
    ctx.fillText(GLYPHS[piece], x, y + 3);
    ctx.restore();
  }

  draw(highlights: Highlight[] = this.highlights(), moving: MovingPiece[] = this.movingPieces()) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const axes = this.axes();
    const theme = THEMES[this.line.boardTheme] ?? THEMES.walnut;
    const cell = SIZE / 8;
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    ctx.fillStyle = theme.border;
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = `${axes.files[col]}${axes.ranks[row]}`;
        const fileIndex = FILES.indexOf(square[0]);
        const rank = Number(square[1]);
        ctx.fillStyle = (fileIndex + rank) % 2 === 0 ? theme.light : theme.dark;
        ctx.fillRect(col * cell, row * cell, cell, cell);
        highlights.forEach((highlight) => {
          if (highlight.square === square) {
            ctx.fillStyle = highlight.color;
            ctx.fillRect(col * cell, row * cell, cell, cell);
          }
        });
        const hidden = moving.some((item) => item.from === square);
        const piece = this.position[square];
        if (piece && !hidden) this.drawPiece(ctx, piece, col * cell + cell / 2, row * cell + cell / 2);
        ctx.fillStyle = "rgba(12,14,17,.68)";
        ctx.font = "bold 15px Arial";
        if (row === 7) ctx.fillText(square[0], col * cell + 7, row * cell + cell - 7);
        if (col === 0) ctx.fillText(square[1], col * cell + 7, row * cell + 17);
      }
    }
    moving.forEach((item) => this.drawPiece(ctx, item.piece, item.x, item.y));
  }

  highlights(): Highlight[] {
    const result: Highlight[] = [];
    if (this.hintedFrom) result.push({ square: this.hintedFrom, color: "rgba(241,193,72,.58)" });
    if (this.auto) {
      const move = moveForFrame(this.line.frames, this.index + 1);
      if (move) result.push({ square: move.from, color: "rgba(239,196,76,.32)" }, { square: move.to, color: "rgba(239,196,76,.5)" });
    }
    if (this.pointer?.moved) result.push({ square: this.pointer.from, color: "rgba(241,193,72,.35)" });
    else if (this.selected) result.push({ square: this.selected, color: "rgba(241,193,72,.52)" });
    return result;
  }

  movingPieces(): MovingPiece[] {
    const moving: MovingPiece[] = [];
    if (this.auto?.visual) moving.push(this.auto.visual);
    if (this.pointer?.moved) moving.push({ from: this.pointer.from, piece: this.pointer.piece, x: this.pointer.x, y: this.pointer.y });
    return moving;
  }

  restart() {
    this.cancelMotion();
    this.wrongToken += 1;
    this.index = 0;
    this.position = { ...this.line.frames[0].position };
    this.selected = null;
    this.hintedFrom = null;
    this.pointer = null;
    this.locked = false;
    this.complete = false;
    this.draw([], []);
    this.update(this.text.getReady, "ready");
    this.later(() => this.advance(), 110);
  }

  back() {
    if (this.index <= 0 && !this.auto) return;
    this.cancelMotion();
    this.wrongToken += 1;
    let target = Math.max(0, this.index - 1);
    while (target > 0 && moveForFrame(this.line.frames, target + 1)?.color !== this.player) target -= 1;
    this.index = target;
    this.position = { ...this.line.frames[target].position };
    this.selected = null;
    this.hintedFrom = null;
    this.pointer = null;
    this.locked = false;
    this.complete = false;
    this.draw([], []);
    this.update(this.text.yourMove, "ready");
    const nextMove = moveForFrame(this.line.frames, target + 1);
    if (nextMove?.color !== this.player) this.later(() => this.advance(), 120);
  }

  hint() {
    const frame = this.helpFrame();
    const move = frame && moveForFrame(this.line.frames, this.index + 1);
    if (!move) return;
    this.selected = null;
    this.hintedFrom = move.from;
    this.draw();
    this.update(this.text.yourMove, "ready");
  }

  show() {
    const frame = this.helpFrame();
    const move = frame && moveForFrame(this.line.frames, this.index + 1);
    if (!frame || !move) return;
    this.wrongToken += 1;
    this.hintedFrom = null;
    this.animatePlayerMove(frame, this.point(move.from));
  }

  advance() {
    if (this.index >= this.line.frames.length - 1) {
      this.complete = true;
      this.locked = false;
      this.draw([], []);
      this.update(this.text.complete, "complete");
      return;
    }
    const frame = this.expected();
    const move = frame && moveForFrame(this.line.frames, this.index + 1);
    if (!frame || !move) {
      this.locked = true;
      this.update(this.text.invalidMove, "wrong");
      return;
    }
    if (move.color !== this.player) {
      this.startAuto(frame, move);
      return;
    }
    this.locked = false;
    this.draw();
    this.update(this.text.yourMove, "ready");
  }

  startAuto(frame: LineFrame, move: LineMove) {
    const from = this.point(move.from);
    const to = this.point(move.to);
    const animation: AutoAnimation = {
      frame,
      piece: this.position[move.from] || move.piece,
      from,
      to,
      startedAt: null,
      duration: 320,
      dragProgress: 0,
      visual: null,
      raf: 0,
    };
    this.hintedFrom = null;
    this.auto = animation;
    this.selected = null;
    this.locked = false;
    this.update(this.text.opponentMove, "opponent");
    const tick = (now: number) => {
      if (this.destroyed || this.auto !== animation) return;
      if (animation.startedAt === null) animation.startedAt = now;
      const timed = Math.min(1, (now - animation.startedAt) / animation.duration);
      const progress = Math.max(timed, animation.dragProgress);
      const ease = 1 - Math.pow(1 - progress, 3);
      animation.visual = { from: move.from, piece: animation.piece, x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
      this.draw();
      if (progress < 1) {
        animation.raf = requestAnimationFrame(tick);
        return;
      }
      this.finishAuto(animation, move);
    };
    animation.raf = requestAnimationFrame(tick);
  }

  finishAuto(animation: AutoAnimation, move?: LineMove) {
    if (this.auto !== animation) return;
    if (animation.raf) cancelAnimationFrame(animation.raf);
    const actualMove = move ?? moveForFrame(this.line.frames, this.index + 1);
    this.position = { ...animation.frame.position };
    this.index += 1;
    this.auto = null;
    if (actualMove) this.draw([{ square: actualMove.from, color: "rgba(239,196,76,.28)" }, { square: actualMove.to, color: "rgba(239,196,76,.52)" }]);
    this.update(actualMove ? this.text.opponentMoved.replace("{move}", `${actualMove.from} → ${actualMove.to}`) : this.text.opponentMoved.replace("{move}", ""), "opponent");
    this.advance();
  }

  animatePlayerMove(frame: LineFrame, start: Point) {
    const move = moveForFrame(this.line.frames, this.index + 1);
    if (!move) return;
    const target = this.point(move.to);
    const fullStart = this.point(move.from);
    const fullDistance = Math.hypot(target.x - fullStart.x, target.y - fullStart.y) || 1;
    const remainingDistance = Math.hypot(target.x - start.x, target.y - start.y);
    const duration = Math.max(70, Math.min(240, 70 + 170 * remainingDistance / fullDistance));
    const started = performance.now();
    this.locked = true;
    this.selected = null;
    this.hintedFrom = null;
    const tick = (now: number) => {
      if (this.destroyed) return;
      const progress = Math.min(1, (now - started) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const visual = { from: move.from, piece: this.position[move.from] || move.piece, x: start.x + (target.x - start.x) * ease, y: start.y + (target.y - start.y) * ease };
      this.draw([{ square: move.from, color: "rgba(66,194,117,.18)" }, { square: move.to, color: "rgba(66,194,117,.38)" }], [visual]);
      if (progress < 1) {
        this.motionRaf = requestAnimationFrame(tick);
        return;
      }
      this.motionRaf = 0;
      this.position = { ...frame.position };
      this.index += 1;
      this.locked = true;
      this.draw([{ square: move.from, color: "rgba(66,194,117,.26)" }, { square: move.to, color: "rgba(66,194,117,.55)" }], []);
      this.update(this.text.correctMove, "correct");
      this.later(() => {
        this.locked = false;
        this.advance();
      }, 210);
    };
    this.motionRaf = requestAnimationFrame(tick);
  }

  wrong(fromSquare: string, toSquare: string, release?: Point) {
    const piece = this.position[fromSquare];
    if (!piece) return;
    const start = this.point(fromSquare);
    const end = this.point(toSquare);
    const started = performance.now();
    const duration = 400;
    const token = ++this.wrongToken;
    this.locked = true;
    this.selected = null;
    this.hintedFrom = null;
    this.update(this.text.wrongMove, "wrong");
    const tick = (now: number) => {
      if (this.destroyed || token !== this.wrongToken) return;
      const progress = Math.min(1, (now - started) / duration);
      let point: Point;
      if (release) {
        const ease = 1 - Math.pow(1 - progress, 3);
        point = { x: release.x + (start.x - release.x) * ease + Math.sin(progress * Math.PI * 4) * (1 - progress) * 7, y: release.y + (start.y - release.y) * ease };
      } else {
        const travel = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        point = { x: start.x + (end.x - start.x) * travel, y: start.y + (end.y - start.y) * travel };
      }
      this.draw([{ square: fromSquare, color: "rgba(218,65,65,.35)" }, { square: toSquare, color: "rgba(218,65,65,.58)" }], [{ from: fromSquare, piece, ...point }]);
      if (progress < 1) {
        this.motionRaf = requestAnimationFrame(tick);
        return;
      }
      this.motionRaf = 0;
      this.locked = false;
      this.draw([{ square: fromSquare, color: "rgba(218,65,65,.24)" }], []);
      this.later(() => {
        if (token !== this.wrongToken) return;
        this.draw();
        this.update(this.text.yourMove, "ready");
      }, 430);
    };
    this.motionRaf = requestAnimationFrame(tick);
  }

  attempt(from: string, to: string, release?: Point) {
    if (this.locked || this.complete) return;
    const frame = this.expected();
    const move = frame && moveForFrame(this.line.frames, this.index + 1);
    if (frame && move?.color === this.player && move.from === from && move.to === to) this.animatePlayerMove(frame, release ?? this.point(from));
    else this.wrong(from, to, release);
  }

  selectSquare(square: string | null) {
    if (!square || this.locked || this.complete || this.auto) return;
    if (this.selected) {
      if (this.selected === square) {
        this.selected = null;
        this.draw();
      } else {
        const from = this.selected;
        this.selected = null;
        this.attempt(from, square);
      }
      return;
    }
    if (this.position[square]) {
      this.selected = square;
      this.draw();
    }
  }

  dragProgress(pointer: RuntimePointer) {
    const start = this.point(pointer.from);
    const end = this.point(pointer.target);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = dx * dx + dy * dy;
    return length ? Math.max(0, Math.min(1, ((pointer.x - start.x) * dx + (pointer.y - start.y) * dy) / length)) : 0;
  }

  onPointerDown = (event: PointerEvent) => {
    if (this.locked || this.complete || this.pointer) return;
    event.preventDefault();
    const square = this.squareAt(event);
    const frame = this.playerFrame();
    const offset = this.auto ? 2 : 1;
    const move = frame && moveForFrame(this.line.frames, this.index + offset);
    const piece = square && (this.auto ? this.auto.frame.position[square] : this.position[square]);
    if (this.auto && (!move || square !== move.from || !piece)) return;
    if (!square || !piece) {
      this.selectSquare(square);
      return;
    }
    const point = this.eventPoint(event);
    this.pointer = { id: event.pointerId, from: square, piece, target: move?.from === square ? move.to : square, startX: event.clientX, startY: event.clientY, x: point.x, y: point.y, moved: false };
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  };

  onPointerMove = (event: PointerEvent) => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const point = this.eventPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    if (Math.abs(event.clientX - pointer.startX) + Math.abs(event.clientY - pointer.startY) > 7) pointer.moved = true;
    if (pointer.moved && this.auto) this.auto.dragProgress = Math.max(this.auto.dragProgress, this.dragProgress(pointer));
    if (pointer.moved) this.draw();
  };

  onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    const square = this.squareAt(event);
    const release = this.eventPoint(event);
    if (this.auto) this.finishAuto(this.auto);
    this.pointer = null;
    if (pointer.moved && square && square !== pointer.from) this.attempt(pointer.from, square, release);
    else this.selectSquare(pointer.from);
  };

  onPointerCancel = () => {
    this.pointer = null;
    this.selected = null;
    this.draw();
  };
}

export function PracticeBoard({ line, text, onUpdate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PracticeRuntime | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const [snapshot, setSnapshot] = useState<PracticeSnapshot>({ index: 0, phase: "ready", message: text.getReady, canBack: false, canHint: false });

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = new PracticeRuntime(canvas, line, text, (next) => {
      setSnapshot(next);
      onUpdateRef.current(next);
    });
    runtimeRef.current = runtime;
    runtime.start();
    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, [line, text]);

  const theme = THEMES[line.boardTheme] ?? THEMES.walnut;
  const boardStyle = {
    "--light-square": theme.light,
    "--dark-square": theme.dark,
    "--board-border": theme.border,
  } as CSSProperties;

  function suppressPointer(event: ReactPointerEvent) {
    event.stopPropagation();
  }

  return (
    <div className="practice-board-stack">
      <div className={`board-wrap practice-board phase-${snapshot.phase}`} style={boardStyle}>
        <canvas ref={canvasRef} className="practice-canvas" width={SIZE} height={SIZE} aria-label={text.practice} />
      </div>
      <div className="practice-board-controls" onPointerDown={suppressPointer}>
        <button className="button" type="button" onClick={() => runtimeRef.current?.back()} disabled={!snapshot.canBack}>{text.backMove}</button>
        <button className="button" type="button" onClick={() => runtimeRef.current?.restart()}>{text.restart}</button>
        <button className="button" type="button" onClick={() => runtimeRef.current?.hint()} disabled={!snapshot.canHint}>{text.hint}</button>
        <button className="button show-move" type="button" onClick={() => runtimeRef.current?.show()} disabled={!snapshot.canHint}>{text.showMove}</button>
      </div>
    </div>
  );
}
