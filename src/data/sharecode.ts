// Export/import a level as a compact, URL-safe share code — fully client-side,
// no backend. A short version tag lets us evolve the format later. Imported
// codes are always run through validateLevel() so untrusted input stays safe.

import { LevelSpec, validateLevel } from "./schema";

const TAG = "BS1"; // Blind Shot, format v1

// UTF-8-safe base64 (btoa only handles latin1).
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

// Round the level to trim precision so codes stay short.
function compact(level: LevelSpec): LevelSpec {
  const r = (n: number) => Math.round(n);
  const v = (p: { x: number; y: number }) => ({ x: r(p.x), y: r(p.y) });
  return {
    ...level,
    gravity: r(level.gravity),
    wind: v(level.wind),
    target: {
      pos: v(level.target.pos),
      rings: level.target.rings.map(r),
      motion: level.target.motion,
    },
    walls: level.walls.map((w) => ({ ...w, a: v(w.a), b: v(w.b) })),
    portals: level.portals.map((p) => ({
      ...p,
      a: { pos: v(p.a.pos), angle: p.a.angle },
      b: { pos: v(p.b.pos), angle: p.b.angle },
    })),
  };
}

export function exportCode(level: LevelSpec): string {
  return TAG + b64encode(JSON.stringify(compact(level)));
}

// Parse a share code back into a validated level, or null if invalid.
export function importCode(code: string): LevelSpec | null {
  try {
    const trimmed = code.trim();
    const body = trimmed.startsWith(TAG) ? trimmed.slice(TAG.length) : trimmed;
    const json = b64decode(body);
    return validateLevel(JSON.parse(json));
  } catch {
    return null;
  }
}
