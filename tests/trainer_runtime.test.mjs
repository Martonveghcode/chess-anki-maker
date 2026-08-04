import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(projectRoot, "backend", "server.py"), "utf8");
const marker = 'TRAINER_SCRIPT = r"""';
const start = source.indexOf(marker) + marker.length;
const end = source.indexOf('\n"""', start);

assert.ok(start >= marker.length && end > start, "trainer script is embedded in server.py");

const script = source
  .slice(start, end)
  .replace(/^\s*<script>\s*/, "")
  .replace(/\s*<\/script>\s*$/, "");

const frames = [
  { position: { e2: "wP", e7: "bP", g1: "wN" } },
  { position: { e4: "wP", e7: "bP", g1: "wN" }, move: { from: "e2", to: "e4", piece: "wP", color: "w" } },
  { position: { e4: "wP", e5: "bP", g1: "wN" }, move: { from: "e7", to: "e5", piece: "bP", color: "b" } },
  { position: { e4: "wP", e5: "bP", f3: "wN" }, move: { from: "g1", to: "f3", piece: "wN", color: "w" } },
];
const payload = Buffer.from(JSON.stringify({
  frames,
  settings: { orientation: "white", boardTheme: "walnut", pieceStyle: "classic" },
}), "utf8").toString("base64");

const listeners = new Map();
const fillCalls = [];
const context = {
  fillStyle: "",
  fillRect(x, y, width, height) { fillCalls.push({ x, y, width, height, color: this.fillStyle }); },
  fillText() {},
  strokeText() {},
  save() {},
  restore() {},
};
let pointerCaptures = 0;
const canvas = {
  width: 640,
  height: 640,
  addEventListener(type, listener) { listeners.set(type, listener); },
  getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 640 }; },
  getContext() { return context; },
  setPointerCapture() { pointerCaptures += 1; },
};
const message = { textContent: "" };
const progress = { textContent: "" };
const resetListeners = new Map();
const resetButton = {
  addEventListener(type, listener) { resetListeners.set(type, listener); },
};
const hintListeners = new Map();
const hintButton = {
  disabled: false,
  addEventListener(type, listener) { hintListeners.set(type, listener); },
};
const showListeners = new Map();
const showButton = {
  disabled: false,
  addEventListener(type, listener) { showListeners.set(type, listener); },
};
const classes = new Set();
const root = {
  dataset: { payload },
  innerHTML: "",
  classList: {
    add(...names) { names.forEach((name) => classes.add(name)); },
    remove(...names) { names.forEach((name) => classes.delete(name)); },
  },
  querySelector(selector) {
    if (selector === "canvas") return canvas;
    if (selector === ".cam-message") return message;
    if (selector === ".cam-progress") return progress;
    if (selector === ".cam-reset") return resetButton;
    if (selector === ".cam-hint") return hintButton;
    if (selector === ".cam-show") return showButton;
    throw new Error(`Unexpected selector: ${selector}`);
  },
};

const animationFrames = new Map();
let nextAnimationFrame = 1;
globalThis.document = { querySelectorAll: () => [root] };
globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
globalThis.requestAnimationFrame = (callback) => {
  const id = nextAnimationFrame++;
  animationFrames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => animationFrames.delete(id);

new Function(script)();

assert.notEqual(root.innerHTML, '<div class="cam-step">Trainer unavailable</div>');
assert.equal(message.textContent, "Your move · Play as White");

assert.equal(hintButton.disabled, false);
assert.equal(showButton.disabled, false);

fillCalls.length = 0;
hintListeners.get("click")({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(
  fillCalls.filter((call) => call.color === "rgba(241,193,72,.58)"),
  [{ x: 320, y: 480, width: 80, height: 80, color: "rgba(241,193,72,.58)" }],
  "Hint highlights the e2 origin square for the current move",
);

function center(square) {
  const file = "abcdefgh".indexOf(square[0]);
  const row = 8 - Number(square[1]);
  return { clientX: (file + 0.5) * 80, clientY: (row + 0.5) * 80 };
}

function pointerEvent(square, pointerId = 1) {
  return { pointerId, ...center(square), preventDefault() {} };
}

listeners.get("pointerdown")(pointerEvent("e2"));
listeners.get("pointermove")(pointerEvent("e4"));
listeners.get("pointerup")(pointerEvent("e4"));

assert.equal(message.textContent, "Opponent is moving…", "automatic reply starts without an added pause");
assert.equal(animationFrames.size, 1, "automatic reply uses its normal animation");

listeners.get("pointerdown")(pointerEvent("g1", 2));
listeners.get("pointermove")(pointerEvent("f3", 2));

assert.equal(pointerCaptures, 2, "the next player piece can be grabbed during the reply");

const [[animationId, animate]] = animationFrames;
animationFrames.delete(animationId);
animate(0);

assert.equal(message.textContent, "Your move · Play as White", "the fast drag pulls the reply to completion");

listeners.get("pointerup")(pointerEvent("f3", 2));

assert.equal(message.textContent, "Line complete");
assert.ok(classes.has("is-complete"));
assert.equal(animationFrames.size, 0);

assert.equal(hintButton.disabled, true);
assert.equal(showButton.disabled, true);

resetListeners.get("click")({ stopPropagation() {} });
showListeners.get("click")({ preventDefault() {}, stopPropagation() {} });
assert.equal(hintButton.disabled, true, "help controls are disabled during the opponent reply");

let [autoId, autoTick] = animationFrames.entries().next().value;
animationFrames.delete(autoId);
autoTick(0);
[autoId, autoTick] = animationFrames.entries().next().value;
animationFrames.delete(autoId);
autoTick(300);

assert.equal(showButton.disabled, false);
showListeners.get("click")({ preventDefault() {}, stopPropagation() {} });
assert.equal(message.textContent, "Line complete", "Show performs the final current player move");
assert.ok(classes.has("is-complete"));

console.log("Dynamic trainer hint and show behavior OK");
