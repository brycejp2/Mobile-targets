// Turns a HitInfo into points and tracks a combo/streak. Kept small and pure so
// later phases can layer multipliers and challenge thresholds on top.

import { HitInfo, Target } from "../entities/target";

export interface ScoreEvent {
  points: number;
  hit: boolean;
  combo: number;
  ringScore: number;
}

export class Scoring {
  score = 0;
  combo = 0;
  best = 0;

  reset(): void {
    this.score = 0;
    this.combo = 0;
  }

  record(hit: HitInfo, target: Target): ScoreEvent {
    const isHit = hit.ringScore > 0;

    let points = 0;
    if (isHit) {
      // Base by ring + proximity bonus (closer to bullseye = more).
      const proximity = Math.max(0, target.outerRadius - hit.distance);
      points = hit.ringScore * 100 + Math.round(proximity);
      this.combo += 1;
      if (this.combo > 1) points = Math.round(points * (1 + (this.combo - 1) * 0.25));
    } else {
      this.combo = 0;
    }

    this.score += points;
    this.best = Math.max(this.best, this.score);
    return { points, hit: isHit, combo: this.combo, ringScore: hit.ringScore };
  }
}
