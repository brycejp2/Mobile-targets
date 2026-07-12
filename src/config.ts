// All gameplay tunables live here so balance can be adjusted without hunting
// through logic. Units are world-space unless noted. World space is chosen so a
// throw travels a large distance (target is offscreen); the camera maps world ->
// screen for rendering.

export const CONFIG = {
  // --- World / launch ---
  // Launch point is anchored near the bottom-left of the world origin region.
  launch: { x: 0, y: 0 },

  // Range the target can be placed at, relative to the launch point (world units).
  // Positive x is to the right; positive y is UP (we flip y at render time).
  target: {
    minX: 900,
    maxX: 2200,
    minY: 200,
    maxY: 1400,
    // Concentric ring radii (world units), outermost first. Innermost = bullseye.
    rings: [140, 100, 64, 32],
  },

  // --- Physics ---
  physics: {
    gravity: 900, // world units / s^2, pulls -y (down)
    // A full-power throw launches at this speed (world units / s).
    maxSpeed: 2600,
    // Max drag distance in *screen* pixels that maps to full power.
    maxPullPx: 180,
    // Simple air drag applied to velocity each second (0 = none).
    airDrag: 0.02,
    // Flight ends when the dart drops below this y (world units) or leaves bounds.
    groundY: -80,
    maxFlightTime: 6, // safety cap in seconds
  },

  // --- Camera ---
  camera: {
    // Fraction of the shorter screen dimension used as world padding while aiming.
    aimZoomPadding: 0.18,
    revealDuration: 1.1, // seconds to pan/zoom to the landing
    aimReturnDuration: 0.6,
  },

  // --- Scoring ---
  scoring: {
    bullseyeBonus: 250,
    comboStep: 0.25, // each combo level adds 25% to the throw's points
  },

  // --- Modes ---
  modes: {
    timeAttackSeconds: 60,
    dailyAttempts: 5,
    dailyPassingScore: 1500,
    predictRounds: 6,
    // Prediction scoring: full points within `perfectDist`, zero past `zeroDist`.
    predict: { maxPoints: 500, perfectDist: 40, zeroDist: 600 },
  },

  // --- Feel ---
  dartLengthPx: 34,
  // Bullet-time as the dart nears the target.
  slowmo: {
    triggerDist: 300, // world units from target center
    minScale: 0.32, // slowest time scale at closest
    ramp: 6, // how fast time scale eases back toward its target
  },
  shake: {
    hitMag: 14, // screen px on a hit
    bullseyeMag: 22,
    decay: 5, // per second
  },
  hud: {
    edgePadding: 14,
    gaugeThickness: 8,
  },
} as const;

export type Config = typeof CONFIG;
