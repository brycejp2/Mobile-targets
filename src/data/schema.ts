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
  // If set, the target is a THROWN object: it launches from `pos` with this
  // initial velocity and falls under gravity. Hit it before it lands or fail.
  throwVel?: Vec2;
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

export type LevelMode = "throw" | "predict";

export interface LevelSpec {
  index: number;
  gravity: number;
  wind: Vec2; // constant acceleration applied during flight
  target: TargetSpec;
  walls: WallSpec[];
  portals: PortalSpec[];
  mode?: LevelMode; // defaults to "throw"
  attempts?: number; // for challenge/daily levels
  passingScore?: number; // for challenge/daily levels
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

  // Thrown ("skeet") targets from level 5, sometimes. These arc through the air
  // and must be hit before they land.
  let throwVel: Vec2 | undefined;
  let motion: TargetMotion | undefined;
  if (index >= 5 && rng.next() < 0.25) {
    throwVel = { x: rng.range(-320, -120), y: rng.range(1250, 1750) };
  } else if (index >= 4) {
    // Otherwise, bob/drift from level 4.
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
    target: { pos: { x: CONFIG.launch.x + xdist, y: CONFIG.launch.y + ydist }, rings, motion, throwVel },
    walls: [],
    portals: [],
  };
}

// A fixed daily challenge: everyone on the same date plays the same seed. Uses a
// mid-range difficulty plus wind so scores are comparable and skill-based.
export function generateDailyLevel(seed: number): LevelSpec {
  const rng = new Rng(seed);
  const base = generateLevel(6, rng);
  return {
    ...base,
    index: 0,
    attempts: CONFIG.modes.dailyAttempts,
    passingScore: CONFIG.modes.dailyPassingScore,
  };
}

// --- Validation (untrusted content is data-only, so we clamp + reject) --------

const BOUNDS = {
  pos: 8000,
  ring: 400,
  wind: 800,
  gravity: 3000,
  portalR: 400,
  amplitude: 1000,
  speed: 5,
};

function num(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}

function vec2(v: unknown, bound: number): Vec2 | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  return { x: num(o.x, -bound, bound, 0), y: num(o.y, -bound, bound, 0) };
}

// Validate + sanitize an arbitrary object into a safe LevelSpec, or null if it
// is fundamentally malformed (no valid target). Never throws.
export function validateLevel(raw: unknown): LevelSpec | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const t = (r.target ?? {}) as Record<string, unknown>;
    const pos = vec2(t.pos, BOUNDS.pos);
    if (!pos) return null;

    let rings = Array.isArray(t.rings)
      ? (t.rings as unknown[]).map((x) => num(x, 1, BOUNDS.ring, 0)).filter((x) => x > 0)
      : [];
    if (rings.length === 0) rings = [...CONFIG.target.rings];
    rings.sort((a, b) => b - a); // outermost first

    let motion: TargetMotion | undefined;
    const m = t.motion as Record<string, unknown> | undefined;
    if (m && (m.axis === "x" || m.axis === "y" || m.axis === "xy")) {
      motion = {
        axis: m.axis,
        amplitude: num(m.amplitude, 0, BOUNDS.amplitude, 0),
        speed: num(m.speed, 0, BOUNDS.speed, 1),
        phase: num(m.phase, -Math.PI * 2, Math.PI * 2, 0),
      };
    }

    const throwVel = t.throwVel ? vec2(t.throwVel, 4000) ?? undefined : undefined;

    const walls = (Array.isArray(r.walls) ? r.walls : [])
      .map((w) => {
        const o = w as Record<string, unknown>;
        const a = vec2(o.a, BOUNDS.pos);
        const b = vec2(o.b, BOUNDS.pos);
        if (!a || !b) return null;
        return { a, b, restitution: num(o.restitution, 0, 1, 0.5), friction: num(o.friction, 0, 1, 0.05) };
      })
      .filter((w): w is WallSpec => w !== null)
      .slice(0, 40);

    const portals = (Array.isArray(r.portals) ? r.portals : [])
      .map((p) => {
        const o = p as Record<string, unknown>;
        const ga = o.a as Record<string, unknown> | undefined;
        const gb = o.b as Record<string, unknown> | undefined;
        const pa = ga && vec2(ga.pos, BOUNDS.pos);
        const pb = gb && vec2(gb.pos, BOUNDS.pos);
        if (!pa || !pb) return null;
        return {
          a: { pos: pa, angle: num(ga!.angle, -Math.PI * 2, Math.PI * 2, 0) },
          b: { pos: pb, angle: num(gb!.angle, -Math.PI * 2, Math.PI * 2, 0) },
          radius: num(o.radius, 20, BOUNDS.portalR, 70),
          speedMult: num(o.speedMult, 0.2, 3, 1),
        };
      })
      .filter((p): p is PortalSpec => p !== null)
      .slice(0, 8);

    const mode: LevelMode = r.mode === "predict" ? "predict" : "throw";
    const level: LevelSpec = {
      index: num(r.index, 0, 9999, 1),
      gravity: num(r.gravity, 0, BOUNDS.gravity, CONFIG.physics.gravity),
      wind: vec2(r.wind, BOUNDS.wind) ?? { x: 0, y: 0 },
      target: { pos, rings, motion, throwVel },
      walls,
      portals,
      mode,
    };
    if (typeof r.attempts === "number") level.attempts = num(r.attempts, 1, 20, 5);
    if (typeof r.passingScore === "number") level.passingScore = num(r.passingScore, 0, 100000, 1000);
    return level;
  } catch {
    return null;
  }
}

// A prediction round: a fixed throw the player must forecast. Returns the level
// plus the predetermined launch velocity (power/angle are shown, not chosen).
export function generatePredictLevel(rng: Rng, index: number): { level: LevelSpec; velocity: Vec2 } {
  const level = generateLevel(index, rng);
  level.mode = "predict";
  level.wind = { x: 0, y: 0 }; // keep prediction about the arc, not wind
  level.target.motion = undefined;
  const power = rng.range(0.55, 0.9);
  const angle = rng.range(0.45, 1.05); // ~26°..60°
  const speed = power * CONFIG.physics.maxSpeed;
  return { level, velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed } };
}
