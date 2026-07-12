// The target the player is throwing at. It sits offscreen during aiming; the
// camera reveals it after the throw. Scoring is by concentric rings. Targets can
// optionally bob/drift (Phase 3 moving targets).

import { CONFIG } from "../config";
import { TargetMotion } from "../data/schema";
import { dist, Vec2 } from "../util/math";

export interface HitInfo {
  // Distance from the landing point to the bullseye center (world units).
  distance: number;
  // Index into rings[] of the tightest ring the landing falls within, or -1 for
  // a complete miss (outside the outermost ring).
  ringIndex: number;
  // 0 (miss) .. rings.length (bullseye). Higher is better.
  ringScore: number;
}

export class Target {
  base: Vec2; // center of motion
  pos: Vec2; // current position (== base when not moving)
  readonly rings: readonly number[];
  readonly motion?: TargetMotion;

  constructor(pos: Vec2, rings: readonly number[] = CONFIG.target.rings, motion?: TargetMotion) {
    this.base = { ...pos };
    this.pos = { ...pos };
    this.rings = rings;
    this.motion = motion;
  }

  // Radius of the outermost (largest) ring.
  get outerRadius(): number {
    return this.rings[0];
  }

  update(time: number): void {
    if (!this.motion) return;
    const { axis, amplitude, speed, phase } = this.motion;
    const s = Math.sin(time * speed + phase) * amplitude;
    this.pos = {
      x: this.base.x + (axis === "x" || axis === "xy" ? s : 0),
      y: this.base.y + (axis === "y" || axis === "xy" ? s : 0),
    };
  }

  evaluate(landing: Vec2): HitInfo {
    const d = dist(landing, this.pos);
    // rings are ordered outermost -> innermost. Find the tightest one containing d.
    let ringIndex = -1;
    for (let i = 0; i < this.rings.length; i++) {
      if (d <= this.rings[i]) ringIndex = i;
    }
    // ringScore: outside all rings = 0; outermost = 1; bullseye = rings.length.
    const ringScore = ringIndex === -1 ? 0 : ringIndex + 1;
    return { distance: d, ringIndex, ringScore };
  }
}
