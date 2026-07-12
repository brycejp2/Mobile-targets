// Small seedable PRNG (mulberry32). Deterministic given a seed, which later
// phases use for daily challenges and reproducible levels. Phase 1 just seeds it
// from the clock.

export class Rng {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  // Returns a float in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Float in [min, max).
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

// Convert an arbitrary string (e.g. a date "2026-07-12") into a 32-bit seed.
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
