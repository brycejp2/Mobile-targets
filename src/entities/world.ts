// The world holds the launch point and the active LevelSpec (target, walls,
// portals, wind, gravity). Coordinate convention: +x right, +y up, origin at the
// launch point.

import { CONFIG } from "../config";
import { LevelSpec } from "../data/schema";
import { Vec2 } from "../util/math";
import { Target } from "./target";

export class World {
  readonly launch: Vec2 = { ...CONFIG.launch };
  level!: LevelSpec;
  target!: Target;

  constructor(level: LevelSpec) {
    this.load(level);
  }

  load(level: LevelSpec): void {
    this.level = level;
    this.target = new Target(
      level.target.pos,
      level.target.rings,
      level.target.motion,
      level.target.throwVel,
    );
  }

  // Advance target motion. Returns true if a thrown target just hit the ground.
  advance(dt: number, time: number, gravity: number, groundY: number): boolean {
    return this.target.advance(dt, time, gravity, groundY);
  }

  // Signed offset from the launch point to the (current) target, for HUD gauges.
  targetOffset(): Vec2 {
    return {
      x: this.target.pos.x - this.launch.x,
      y: this.target.pos.y - this.launch.y,
    };
  }
}
