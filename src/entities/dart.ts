// The thrown dart. Holds kinematic state and a short motion trail. Motion is
// driven externally (game.ts orchestrates integrate + collision each step) so
// bounce surfaces and portals can be resolved between position updates.

import { CONFIG } from "../config";
import { len, Vec2 } from "../util/math";

const MAX_TRAIL = 60;

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

  // Called after integrate + collision have updated pos/vel for this step.
  // Records the trail and reports whether the flight should end (fell to ground
  // or exceeded the time cap). Mutating inFlight/landed is the caller's job.
  afterMove(dt: number): boolean {
    this.flightTime += dt;
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > MAX_TRAIL) this.trail.shift();

    const belowGround = this.pos.y <= CONFIG.physics.groundY;
    const tooLong = this.flightTime >= CONFIG.physics.maxFlightTime;
    return belowGround || tooLong;
  }

  // Heading in radians for rendering the dart oriented along its velocity.
  get heading(): number {
    return len(this.vel) > 1 ? Math.atan2(this.vel.y, this.vel.x) : 0;
  }
}
