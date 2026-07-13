// Runtime content loader. On launch we fetch a remote manifest of levels plus an
// optional dated daily challenge, validate everything as data-only, cache it for
// offline play, and merge it over the bundled defaults. Because content is
// fetched at runtime, the dev publishes new levels or a new daily by editing
// those JSON files on any static host — no app rebuild or redeploy required.

import { CONFIG } from "../config";
import { BUNDLED_DAILY, BUNDLED_LEVELS } from "../data/levels";
import { LevelSpec, validateLevel } from "../data/schema";

const CACHE_KEY = "blindshot.content.v1";

export interface Content {
  levels: LevelSpec[];
  daily: Record<string, LevelSpec>; // keyed by YYYY-MM-DD
}

function validateList(raw: unknown): LevelSpec[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(validateLevel).filter((l): l is LevelSpec => l !== null);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function readCache(): Content | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { levels?: unknown; daily?: Record<string, unknown> };
    const daily: Record<string, LevelSpec> = {};
    for (const [k, v] of Object.entries(parsed.daily ?? {})) {
      const lv = validateLevel(v);
      if (lv) daily[k] = lv;
    }
    return { levels: validateList(parsed.levels), daily };
  } catch {
    return null;
  }
}

function writeCache(c: Content): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

// Fetch + validate + cache remote content, falling back to cache then bundled
// defaults. Always resolves (never rejects) so the game can start regardless.
export async function loadContent(): Promise<Content> {
  const base = CONFIG.contentUrl;
  const [levelsRaw, dailyRaw] = await Promise.all([
    fetchJson(base + "levels.json"),
    fetchJson(base + "daily.json"),
  ]);

  const remoteLevels = validateList(levelsRaw);
  const daily: Record<string, LevelSpec> = {};
  if (dailyRaw && typeof dailyRaw === "object") {
    for (const [k, v] of Object.entries(dailyRaw as Record<string, unknown>)) {
      const lv = validateLevel(v);
      if (lv) daily[k] = lv;
    }
  }

  // If the network gave us nothing, fall back to cache, then bundled defaults.
  if (remoteLevels.length === 0 && Object.keys(daily).length === 0) {
    const cached = readCache();
    if (cached) return cached;
    return { levels: [...BUNDLED_LEVELS], daily: {} };
  }

  // Merge: bundled defaults first, remote levels appended (remote can extend).
  const content: Content = {
    levels: [...BUNDLED_LEVELS, ...remoteLevels],
    daily,
  };
  writeCache(content);
  return content;
}

// Pick the daily level for a date: remote first, then bundled default.
export function dailyFor(content: Content, dateKey: string): LevelSpec {
  return content.daily[dateKey] ?? BUNDLED_DAILY;
}
