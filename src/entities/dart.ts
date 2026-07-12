// The thrown dart. Holds kinematic state, a short motion trail for rendering,
// and delegates its per-step motion to the physics integrator.

import { CONFIG } from "../config";
import { integrate } from "../systems/physics";
import { len, Vec2 } from "../util/math";

const MAX_TRAIL = 40;

export class Dart {
  pos: Vec2;
  vel: Vec2;
  inFlight = false;
  landed = false;
  flightTime = 0;
  trail: Vec2[] = [];

  constructor(pos: Vec2) {
    this.pos = { ...pos };
    this.vel = { x: 0, y: 0 };
  }

  launch(velocity: Vec2): void {
    this.vel = { ...velocity };
    this.inFlight = true;
    this.landed = false;
    this.flightTime = 0;
    this.trail = [{ ...this.pos }];
  }

  // Returns true on the step the dart lands (so the caller can transition state).
  step(dt: number): boolean {
    if (!this.inFlight) return false;

    integrate(this, dt);
    this.flightTime += dt;

    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > MAX_TRAIL) this.trail.shift();

    const belowGround = this.pos.y <= CONFIG.physics.groundY;
    const tooLong = this.flightTime >= CONFIG.physics.maxFlightTime;
    if (belowGround || tooLong) {
      this.inFlight = false;
      this.landed = true;
      return true;
    }
    return false;
  }

  // Heading in radians for rendering the dart oriented along its velocity.
  get heading(): number {
    return len(this.vel) > 1 ? Math.atan2(this.vel.y, this.vel.x) : 0;
  }
}
