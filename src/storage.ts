// Thin localStorage wrapper for persistent progress. Kept tiny and defensive so
// a corrupt or unavailable store never crashes the game (private browsing, etc).

const KEY = "blindshot.save.v1";

export interface SaveData {
  highScore: number;
}

const DEFAULTS: SaveData = { highScore: 0 };

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      highScore: Number.isFinite(parsed.highScore) ? (parsed.highScore as number) : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable; ignore.
  }
}
