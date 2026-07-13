// Thin localStorage wrapper for persistent progress. Kept tiny and defensive so
// a corrupt or unavailable store never crashes the game (private browsing, etc).

import { LevelSpec, validateLevel } from "./data/schema";

const KEY = "blindshot.save.v1";
const MY_LEVELS_KEY = "blindshot.mylevels.v1";

export interface DailyRecord {
  played: boolean;
  passed: boolean;
  score: number;
}

export interface SaveData {
  highScore: number;
  dailyStreak: number;
  lastDailyDate: string; // YYYY-MM-DD of the most recent completed daily
  daily: Record<string, DailyRecord>;
}

const DEFAULTS: SaveData = { highScore: 0, dailyStreak: 0, lastDailyDate: "", daily: {} };

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const p = JSON.parse(raw) as Partial<SaveData>;
    return {
      highScore: Number.isFinite(p.highScore) ? (p.highScore as number) : 0,
      dailyStreak: Number.isFinite(p.dailyStreak) ? (p.dailyStreak as number) : 0,
      lastDailyDate: typeof p.lastDailyDate === "string" ? p.lastDailyDate : "",
      daily: p.daily && typeof p.daily === "object" ? (p.daily as Record<string, DailyRecord>) : {},
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable; ignore.
  }
}

// Today's date as a local YYYY-MM-DD string, used as the daily seed + key.
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isYesterday(prev: string, today: string): boolean {
  if (!prev) return false;
  const p = new Date(prev + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  return Math.round((t.getTime() - p.getTime()) / 86400000) === 1;
}

// --- Workshop "My Levels" -----------------------------------------------------

export function loadMyLevels(): LevelSpec[] {
  try {
    const raw = localStorage.getItem(MY_LEVELS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(validateLevel).filter((l): l is LevelSpec => l !== null);
  } catch {
    return [];
  }
}

export function saveMyLevels(levels: LevelSpec[]): void {
  try {
    localStorage.setItem(MY_LEVELS_KEY, JSON.stringify(levels));
  } catch {
    /* storage unavailable */
  }
}

export function addMyLevel(level: LevelSpec): LevelSpec[] {
  const levels = loadMyLevels();
  levels.push(level);
  saveMyLevels(levels);
  return levels;
}

// Record an official daily result, updating the pass streak. Returns the updated
// save so callers can read the new streak.
export function recordDaily(date: string, passed: boolean, score: number): SaveData {
  const data = load();
  data.daily[date] = { played: true, passed, score };
  if (passed) {
    data.dailyStreak = isYesterday(data.lastDailyDate, date) ? data.dailyStreak + 1 : 1;
  } else {
    data.dailyStreak = 0;
  }
  data.lastDailyDate = date;
  save(data);
  return data;
}
