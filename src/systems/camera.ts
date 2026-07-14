// Maps world space (+x right, +y up) to screen space (+y down) and animates
// between framings: a zoomed-in AIMING view near the launch point, and a
// zoomed-out REVEAL view that fits the whole throw.

import { CONFIG } from "../config";
import { clamp, easeInOut, Vec2 } from "../util/math";

interface View {
  center: Vec2;
  scale: number; // screen px per world unit
}

export class Camera {
  center: Vec2 = { x: 0, y: 0 };
  scale = 1;

  private from: View = { center: { x: 0, y: 0 }, scale: 1 };
  private to: View = { center: { x: 0, y: 0 }, scale: 1 };
  private t = 1;
  private duration = 1;

  // Screen-space shake, applied as an offset in worldToScreen.
  private shakeMag = 0;
  private shakeOffset: Vec2 = { x: 0, y: 0 };

  constructor(public viewW: number, public viewH: number) {}

  addShake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: this.viewW / 2 + (p.x - this.center.x) * this.scale + this.shakeOffset.x,
      y: this.viewH / 2 - (p.y - this.center.y) * this.scale + this.shakeOffset.y,
    };
  }

  screenToWorld(p: Vec2): Vec2 {
    return {
      x: this.center.x + (p.x - this.viewW / 2) / this.scale,
      y: this.center.y - (p.y - this.viewH / 2) / this.scale,
    };
  }

  // Place `world` at the given screen fraction (0..1) using `scale`.
  private viewFor(world: Vec2, fx: number, fy: number, scale: number): View {
    return {
      center: {
        x: world.x - (fx - 0.5) * (this.viewW / scale),
        y: world.y + (fy - 0.5) * (this.viewH / scale),
      },
      scale,
    };
  }

  // AIMING framing: launch point sits low-left so up-right throws have room.
  aimView(launch: Vec2): View {
    const scale = this.viewW / 460;
    return this.viewFor(launch, 0.3, 0.78, scale);
  }

  // Fit a set of world points into view with fractional padding.
  fitView(points: Vec2[], paddingFrac: number, pad = 0): View {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    }
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const usableFrac = 1 - 2 * paddingFrac;
    const scaleX = (this.viewW * usableFrac) / worldW;
    const scaleY = (this.viewH * usableFrac) / worldH;
    const scale = Math.max(0.02, Math.min(scaleX, scaleY));
    return { center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, scale };
  }

  // Zoom by `factor` about a screen anchor (keeps the world point under the
  // anchor fixed). Cancels any in-progress framing animation.
  zoomAt(factor: number, anchor: Vec2): void {
    const world = this.screenToWorld(anchor);
    this.scale = clamp(this.scale * factor, CONFIG.camera.minScale, CONFIG.camera.maxScale);
    this.center = {
      x: world.x - (anchor.x - this.viewW / 2) / this.scale,
      y: world.y + (anchor.y - this.viewH / 2) / this.scale,
    };
    this.t = 1;
  }

  // Pan by a screen-space delta (used for pinch drag).
  panScreen(dx: number, dy: number): void {
    this.center = { x: this.center.x - dx / this.scale, y: this.center.y + dy / this.scale };
    this.t = 1;
  }

  setImmediate(v: View): void {
    this.center = { ...v.center };
    this.scale = v.scale;
    this.from = { center: { ...v.center }, scale: v.scale };
    this.to = { center: { ...v.center }, scale: v.scale };
    this.t = 1;
  }

  animateTo(v: View, duration: number): void {
    this.from = { center: { ...this.center }, scale: this.scale };
    this.to = { center: { ...v.center }, scale: v.scale };
    this.duration = Math.max(0.0001, duration);
    this.t = 0;
  }

  update(dt: number): void {
    // Shake decays independently of framing transitions.
    if (this.shakeMag > 0.1) {
      this.shakeOffset = {
        x: (Math.random() * 2 - 1) * this.shakeMag,
        y: (Math.random() * 2 - 1) * this.shakeMag,
      };
      this.shakeMag = Math.max(0, this.shakeMag - CONFIG.shake.decay * this.shakeMag * dt);
    } else {
      this.shakeMag = 0;
      this.shakeOffset = { x: 0, y: 0 };
    }

    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const e = easeInOut(this.t);
    this.center = {
      x: this.from.center.x + (this.to.center.x - this.from.center.x) * e,
      y: this.from.center.y + (this.to.center.y - this.from.center.y) * e,
    };
    // Interpolate scale geometrically for a natural zoom.
    this.scale = this.from.scale * Math.pow(this.to.scale / this.from.scale, e);
  }

  get settling(): boolean {
    return this.t < 1;
  }

  // Re-derive the padding constant lookups for callers.
  static get padding(): number {
    return CONFIG.camera.aimZoomPadding;
  }
}
