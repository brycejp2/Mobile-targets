// Projectile integrator. Kept separate from the Dart entity so later phases
// (wind, bounce surfaces, portals) can extend the force model in one place.

import { CONFIG } from "../config";
import { Vec2 } from "../util/math";

export interface Body {
  pos: Vec2;
  vel: Vec2;
}

// Advance a body by dt seconds under gravity + simple air drag.
// Mutates the body in place.
export function integrate(body: Body, dt: number): void {
  const { gravity, airDrag } = CONFIG.physics;

  // Semi-implicit Euler: update velocity first, then position.
  body.vel.y -= gravity * dt; // +y is up, gravity pulls down

  if (airDrag > 0) {
    const damp = Math.max(0, 1 - airDrag * dt);
    body.vel.x *= damp;
    body.vel.y *= damp;
  }

  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;
}
