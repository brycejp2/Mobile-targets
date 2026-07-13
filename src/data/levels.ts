// Bundled default levels — the offline fallback and a showcase of walls and
// portals. These conform to LevelSpec and pass validateLevel(). The runtime
// content loader (systems/content.ts) merges any remotely-published levels over
// these, so the dev can add more without rebuilding the app.

import { LevelSpec } from "./schema";

export const BUNDLED_LEVELS: LevelSpec[] = [
  {
    index: 1,
    gravity: 900,
    wind: { x: 0, y: 0 },
    target: { pos: { x: 1500, y: 700 }, rings: [140, 100, 64, 32] },
    walls: [],
    portals: [],
    mode: "throw",
  },
  {
    // Bank shot: a bumper wall below the arc.
    index: 2,
    gravity: 900,
    wind: { x: 0, y: 0 },
    target: { pos: { x: 1900, y: 500 }, rings: [130, 95, 60, 30] },
    walls: [{ a: { x: 900, y: 900 }, b: { x: 1500, y: 700 }, restitution: 0.8, friction: 0.05 }],
    portals: [],
    mode: "throw",
  },
  {
    // Portal route to a high target.
    index: 3,
    gravity: 900,
    wind: { x: 120, y: 0 },
    target: { pos: { x: 2100, y: 1200 }, rings: [130, 95, 60, 30] },
    walls: [],
    portals: [
      {
        a: { pos: { x: 800, y: 500 }, angle: 0 },
        b: { pos: { x: 1700, y: 1100 }, angle: 0 },
        radius: 80,
        speedMult: 1,
      },
    ],
    mode: "throw",
  },
];

// A default daily used when no remote daily.json is available and we still want
// something authored. (Endless/daily generators still exist for procedural play.)
export const BUNDLED_DAILY: LevelSpec = {
  index: 0,
  gravity: 900,
  wind: { x: -160, y: 0 },
  target: { pos: { x: 2000, y: 900 }, rings: [120, 88, 56, 28], motion: { axis: "y", amplitude: 120, speed: 1, phase: 0 } },
  walls: [],
  portals: [],
  mode: "throw",
  attempts: 5,
  passingScore: 1500,
};
