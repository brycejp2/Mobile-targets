// The target the player is throwing at. Normally offscreen (aim blind via the
// gauges). It can optionally bob/drift (moving targets) or be a THROWN object
// that arcs through the air and must be hit before it lands.

import { CONFIG } from "../config";
import { TargetMotion } from "../data/schema";
import { dist, Vec2 } from "../util/math";

export interface HitInfo {
  distance: number;
  ringIndex: number;
  ringScore: number; // 0 (miss) .. rings.length (bullseye)
}

export class Target {
  base: Vec2; // center of bob motion / launch point for thrown
  pos: Vec2; // current position
  readonly rings: readonly number[];
  readonly motion?: TargetMotion;

  // Thrown ("skeet") behaviour.
  readonly thrown: boolean;
  vel: Vec2;
  landed = false;

  constructor(
    pos: Vec2,
    rings: readonly number[] = CONFIG.target.rings,
    motion?: TargetMotion,
    throwVel?: Vec2,
  ) {
    this.base = { ...pos };
    this.pos = { ...pos };
    this.rings = rings;
    this.motion = motion;
    this.thrown = !!throwVel;
    this.vel = throwVel ? { ...throwVel } : { x: 0, y: 0 };
  }

  get outerRadius(): number {
    return this.rings[0];
  }

  // Advance the target one step. `time` drives sine bob; `dt`/gravity drive the
  // thrown projectile. Returns true if a thrown target just touched the ground.
  advance(dt: number, time: number, gravity: number, groundY: number): boolean {
    if (this.thrown) {
      if (this.landed) return false;
      this.vel.y -= gravity * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.landed = true;
        return true;
      }
      return false;
    }
    if (this.motion) {
      const { axis, amplitude, speed, phase } = this.motion;
      const s = Math.sin(time * speed + phase) * amplitude;
      this.pos = {
        x: this.base.x + (axis === "x" || axis === "xy" ? s : 0),
        y: this.base.y + (axis === "y" || axis === "xy" ? s : 0),
      };
    }
    return false;
  }

  evaluate(landing: Vec2): HitInfo {
    const d = dist(landing, this.pos);
    let ringIndex = -1;
    for (let i = 0; i < this.rings.length; i++) {
      if (d <= this.rings[i]) ringIndex = i;
    }
    const ringScore = ringIndex === -1 ? 0 : ringIndex + 1;
    return { distance: d, ringIndex, ringScore };
  }
}
