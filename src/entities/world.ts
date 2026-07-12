// The world holds fixed spatial anchors (launch point) and is responsible for
// placing the offscreen target. Coordinate convention: +x right, +y up, origin
// at the launch point.

import { CONFIG } from "../config";
import { Rng } from "../util/rng";
import { Vec2 } from "../util/math";
import { Target } from "./target";

export class World {
  readonly launch: Vec2 = { ...CONFIG.launch };
  target: Target;

  constructor(rng: Rng) {
    this.target = this.spawnTarget(rng);
  }

  spawnTarget(rng: Rng): Target {
    const t = CONFIG.target;
    const pos: Vec2 = {
      x: this.launch.x + rng.range(t.minX, t.maxX),
      y: this.launch.y + rng.range(t.minY, t.maxY),
    };
    this.target = new Target(pos);
    return this.target;
  }

  // Signed offset from the launch point to the target, used by the HUD gauges.
  targetOffset(): Vec2 {
    return {
      x: this.target.pos.x - this.launch.x,
      y: this.target.pos.y - this.launch.y,
    };
  }
}
