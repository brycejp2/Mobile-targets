// Resolves bounce surfaces and portals for the in-flight dart. Called each
// physics step after integrate(), given the pre-step position so we can do
// continuous (swept) collision against thin wall segments.

import { LevelSpec, PortalGate, WallSpec } from "../data/schema";
import { Body } from "./physics";
import { dist, dot, normalize, rotate, Vec2 } from "../util/math";

export interface CollisionState {
  portalCooldown: number;
}

const PORTAL_COOLDOWN = 0.22; // seconds after a teleport before a portal re-fires

// Segment intersection: where does p1->p2 cross a->b? Returns the point + param
// t along p1->p2 (0..1), or null. Standard 2D segment-segment test.
function segIntersect(p1: Vec2, p2: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: b.x - a.x, y: b.y - a.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const qp = { x: a.x - p1.x, y: a.y - p1.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: p1.x + r.x * t, y: p1.y + r.y * t }, t };
}

function reflect(body: Body, wall: WallSpec, point: Vec2): void {
  const d = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y };
  let n = normalize({ x: -d.y, y: d.x });
  // Orient the normal against the incoming velocity.
  if (dot(body.vel, n) > 0) n = { x: -n.x, y: -n.y };

  const vn = dot(body.vel, n); // normal component (negative, into wall)
  // Reflect and scale the normal component by restitution.
  const reflected = {
    x: body.vel.x - (1 + wall.restitution) * vn * n.x,
    y: body.vel.y - (1 + wall.restitution) * vn * n.y,
  };
  // Damp the tangential component by friction.
  const newVn = dot(reflected, n);
  const tang = { x: reflected.x - newVn * n.x, y: reflected.y - newVn * n.y };
  const k = 1 - wall.friction;
  body.vel = { x: newVn * n.x + tang.x * k, y: newVn * n.y + tang.y * k };
  // Nudge off the surface so we don't immediately re-collide.
  body.pos = { x: point.x + n.x * 0.75, y: point.y + n.y * 0.75 };
}

function teleport(body: Body, entry: PortalGate, exit: PortalGate, radius: number, mult: number): void {
  const rel = exit.angle - entry.angle;
  body.vel = rotate({ x: body.vel.x * mult, y: body.vel.y * mult }, rel);
  const dir = normalize(body.vel);
  // Emerge just outside the exit gate along the (rotated) velocity.
  body.pos = { x: exit.pos.x + dir.x * radius * 1.2, y: exit.pos.y + dir.y * radius * 1.2 };
}

export function stepCollisions(
  body: Body,
  prev: Vec2,
  level: LevelSpec,
  state: CollisionState,
  dt: number,
): void {
  // Walls: resolve the nearest crossing this step (one bounce per step is fine
  // at the 120 Hz sim rate).
  let best: { wall: WallSpec; point: Vec2; t: number } | null = null;
  for (const wall of level.walls) {
    const hit = segIntersect(prev, body.pos, wall.a, wall.b);
    if (hit && (!best || hit.t < best.t)) best = { wall, point: hit.point, t: hit.t };
  }
  if (best) reflect(body, best.wall, best.point);

  // Portals: teleport on entering either gate, then cool down.
  state.portalCooldown = Math.max(0, state.portalCooldown - dt);
  if (state.portalCooldown <= 0) {
    for (const p of level.portals) {
      if (dist(body.pos, p.a.pos) <= p.radius) {
        teleport(body, p.a, p.b, p.radius, p.speedMult);
        state.portalCooldown = PORTAL_COOLDOWN;
        break;
      }
      if (dist(body.pos, p.b.pos) <= p.radius) {
        teleport(body, p.b, p.a, p.radius, p.speedMult);
        state.portalCooldown = PORTAL_COOLDOWN;
        break;
      }
    }
  }
}
