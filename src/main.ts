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

// --- Pointer input (covers mouse + touch, plus two-finger pinch-zoom) ---
function pointerPos(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

const pointers = new Map<number, { x: number; y: number }>();
let dragId: number | null = null;
let pinching = false;
let pinchDist = 0;
let pinchMid = { x: 0, y: 0 };

function pinchMetrics(): { dist: number; mid: { x: number; y: number } } {
  const pts = [...pointers.values()];
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return {
    dist: Math.hypot(dx, dy),
    mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
  };
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) {
    dragId = e.pointerId;
    game.onPointerDown(p.x, p.y);
  } else if (pointers.size === 2) {
    // Second finger: cancel any aim drag and start a pinch gesture.
    pinching = true;
    dragId = null;
    game.onPinchStart();
    const m = pinchMetrics();
    pinchDist = m.dist;
    pinchMid = m.mid;
  }
});

canvas.addEventListener("pointermove", (e) => {
  const p = pointerPos(e);
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, p);
  if (pinching && pointers.size >= 2) {
    const m = pinchMetrics();
    if (pinchDist > 0) game.zoomAt(m.dist / pinchDist, m.mid.x, m.mid.y);
    game.panBy(m.mid.x - pinchMid.x, m.mid.y - pinchMid.y);
    pinchDist = m.dist;
    pinchMid = m.mid;
  } else if (e.pointerId === dragId) {
    game.onPointerMove(p.x, p.y);
  }
});

const endPointer = (e: PointerEvent) => {
  const p = pointerPos(e);
  const wasDrag = e.pointerId === dragId && !pinching;
  pointers.delete(e.pointerId);
  if (wasDrag) {
    game.onPointerUp(p.x, p.y);
    dragId = null;
  }
  if (pointers.size < 2) pinching = false;
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

// Mouse wheel zoom (handy on desktop).
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    game.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false },
);

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
  try {
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
    game.render(ctx, acc / STEP);
  } catch (err) {
    // Never let a transient error kill the loop.
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
