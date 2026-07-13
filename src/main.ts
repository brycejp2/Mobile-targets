// Bootstrap: sets up a DPR-aware, full-screen canvas, forwards pointer events to
// the game, and runs a fixed-timestep update loop with interpolated rendering.

import { Game } from "./game";
import { CONFIG } from "./config";
import { exportCode, importCode } from "./data/sharecode";
import { validateLevel } from "./data/schema";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// Logical (CSS) size in pixels; rendering is scaled by devicePixelRatio.
let viewW = 0;
let viewH = 0;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  // Draw in CSS pixels; the transform accounts for DPR.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.onResize(viewW, viewH);
}

const game = new Game(viewW, viewH);

// Dev-only hook so automated tests can read world state and tunables.
if (import.meta.env.DEV) {
  (window as unknown as { __debug: unknown }).__debug = {
    game,
    CONFIG,
    exportCode,
    importCode,
    validateLevel,
  };
}

window.addEventListener("resize", resize);
resize();

// --- Pointer input (covers mouse + touch) ---
function pointerPos(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  game.onPointerDown(p.x, p.y);
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointerPos(e);
  game.onPointerMove(p.x, p.y);
});
const endPointer = (e: PointerEvent) => {
  const p = pointerPos(e);
  game.onPointerUp(p.x, p.y);
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

// --- Fixed-timestep loop ---
const STEP = 1 / 120; // physics step (s)
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  // Guard against huge jumps (tab switch); cap accumulated time.
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  game.render(ctx, acc / STEP);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
