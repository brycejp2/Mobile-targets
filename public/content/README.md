# Blind Shot — runtime content (no redeploy needed)

The game fetches these files **at runtime** on launch, validates them as
data-only, caches them for offline play, and merges them over the levels bundled
into the app. That means you can publish new levels or a new daily challenge by
**editing these JSON files — no rebuild or redeploy of the app**.

## Where the game looks

The base URL is `CONFIG.contentUrl` in `src/config.ts` (default: `content/`,
i.e. these files served from the app's own origin). Point it at **any static
host** — a CDN, GitHub Pages, an S3 bucket, or a gist raw URL — to update content
without touching the app build at all.

## `levels.json`

An **array** of level objects appended to the built-in levels. Example:

```json
[
  {
    "index": 101,
    "gravity": 900,
    "wind": { "x": 200, "y": 0 },
    "target": { "pos": { "x": 2200, "y": 800 }, "rings": [120, 88, 56, 28] },
    "walls": [
      { "a": { "x": 1200, "y": 1300 }, "b": { "x": 1200, "y": 300 },
        "restitution": 0.85, "friction": 0.05 }
    ],
    "portals": [],
    "mode": "throw"
  }
]
```

## `daily.json`

An **object keyed by date** (`YYYY-MM-DD`). The player's device date selects the
entry. Add tomorrow's challenge by adding another key:

```json
{
  "2026-07-13": {
    "target": { "pos": { "x": 2100, "y": 950 }, "rings": [118, 86, 54, 27] },
    "walls": [], "portals": [], "mode": "throw",
    "attempts": 5, "passingScore": 1600
  }
}
```

## Level fields (all validated + clamped on load)

| field | meaning |
| --- | --- |
| `gravity` | downward acceleration (0–3000) |
| `wind` | `{x,y}` constant acceleration during flight |
| `target.pos` | `{x,y}` world position (+x right, +y up from launch) |
| `target.rings` | radii, outermost → innermost; innermost is the bullseye |
| `target.motion` | optional `{axis:"x"|"y"|"xy", amplitude, speed, phase}` |
| `walls` | array of `{a,b,restitution(0–1),friction(0–1)}` bounce segments |
| `portals` | array of `{a:{pos,angle}, b:{pos,angle}, radius, speedMult}` pairs |
| `mode` | `"throw"` (default) or `"predict"` |
| `attempts` / `passingScore` | for daily/challenge levels |

Anything malformed or out of range is clamped or dropped; a level with no valid
target is rejected entirely. Content is **data only** — never code — so publishing
levels is safe.
