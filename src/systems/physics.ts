// Projectile integrator. The force environment (gravity + wind) is passed in so
// each level can vary it, and so bounce/portal collision (collision.ts) can run
// between integration steps.

import { CONFIG } from "../config";
import { Vec2 } from "../util/math";

export interface Body {
  pos: Vec2;
  vel: Vec2;
}

export interface Env {
  gravity: number; // world units / s^2, pulls -y (down)
  wind: Vec2; // constant acceleration, world units / s^2
}

// Advance a body by dt seconds under gravity + wind + simple air drag.
// Mutates the body in place.
export function integrate(body: Body, dt: number, env: Env): void {
  // Semi-implicit Euler: update velocity first, then position.
  body.vel.y -= env.gravity * dt; // +y is up, gravity pulls down
  body.vel.x += env.wind.x * dt;
  body.vel.y += env.wind.y * dt;

  const { airDrag } = CONFIG.physics;
  if (airDrag > 0) {
    const damp = Math.max(0, 1 - airDrag * dt);
    body.vel.x *= damp;
    body.vel.y *= damp;
  }

  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;
}
