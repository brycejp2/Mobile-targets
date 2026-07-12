// Level data model. A LevelSpec is plain data (no code) so it can later be
// authored in the Workshop, shared as a code, or fetched from a remote file and
// run safely (Phase 7). Phase 3 uses it for procedural difficulty and for
// hand-crafted demo levels that show off walls and portals.

import { CONFIG } from "../config";
import { clamp, Vec2 } from "../util/math";
import { Rng } from "../util/rng";

export interface TargetMotion {
  axis: "x" | "y" | "xy";
  amplitude: number; // world units
  speed: number; // radians/sec
  phase: number;
}

export interface TargetSpec {
  pos: Vec2; // base (center) position
  rings: number[]; // outermost -> innermost
  motion?: TargetMotion;
}

// A bounce/blocking surface: dart reflects about the segment normal, scaled by
// restitution (0 = dead wall, ~1 = lively bumper). friction damps tangential.
export interface WallSpec {
  a: Vec2;
  b: Vec2;
  restitution: number;
  friction: number;
}

// One end of a portal pair. angle orients the gate so exit velocity can be
// redirected relative to entry.
export interface PortalGate {
  pos: Vec2;
  angle: number; // radians
}

export interface PortalSpec {
  a: PortalGate;
  b: PortalGate;
  radius: number;
  speedMult: number;
}

export interface LevelSpec {
  index: number;
  gravity: number;
  wind: Vec2; // constant acceleration applied during flight
  target: TargetSpec;
  walls: WallSpec[];
  portals: PortalSpec[];
}

const BASE_RINGS = CONFIG.target.rings as readonly number[];

// Procedural endless difficulty: farther, smaller, windier, and (later) moving
// targets as the index climbs. Deliberately does NOT place random walls/portals,
// which could make a level unsolvable — those come from authored levels.
export function generateLevel(index: number, rng: Rng): LevelSpec {
  const xdist = clamp(1000 + index * 120 + rng.range(-100, 100), 900, 3200);
  const ydist = clamp(360 + index * 55 + rng.range(-80, 160), 200, 1700);

  const shrink = clamp(1 - index * 0.035, 0.5, 1);
  const rings = BASE_RINGS.map((r) => Math.round(r * shrink));

  // Wind ramps in from level 2; direction is random, mostly horizontal.
  let wind: Vec2 = { x: 0, y: 0 };
  if (index >= 2) {
    const mag = Math.min((index - 1) * 24, 340);
    const sign = rng.next() < 0.5 ? -1 : 1;
    wind = { x: sign * mag, y: rng.range(-0.15, 0.15) * mag };
  }

  // Moving targets from level 4.
  let motion: TargetMotion | undefined;
  if (index >= 4) {
    motion = {
      axis: rng.next() < 0.5 ? "y" : "x",
      amplitude: Math.min(50 + index * 8, 220),
      speed: rng.range(0.7, 1.4),
      phase: rng.range(0, Math.PI * 2),
    };
  }

  return {
    index,
    gravity: CONFIG.physics.gravity,
    wind,
    target: { pos: { x: CONFIG.launch.x + xdist, y: CONFIG.launch.y + ydist }, rings, motion },
    walls: [],
    portals: [],
  };
}
