// Turns a HitInfo into points and tracks a combo/streak. Persists the best score
// via storage so it survives reloads. Kept small so later phases can layer
// challenge thresholds on top.

import { HitInfo, Target } from "../entities/target";
import { load, save } from "../storage";
import { CONFIG } from "../config";

export interface ScoreEvent {
  points: number;
  hit: boolean;
  bullseye: boolean;
  combo: number;
  ringScore: number;
  newBest: boolean;
}

export class Scoring {
  score = 0;
  combo = 0;
  best: number;

  constructor() {
    this.best = load().highScore;
  }

  reset(): void {
    this.score = 0;
    this.combo = 0;
  }

  // Add points from a non-ring source (e.g. prediction mode) and update best.
  addPredict(points: number): void {
    this.score += points;
    if (this.score > this.best) {
      this.best = this.score;
      save({ ...load(), highScore: this.best });
    }
  }

  record(hit: HitInfo, target: Target): ScoreEvent {
    const isHit = hit.ringScore > 0;
    const isBullseye = hit.ringScore >= target.rings.length;

    let points = 0;
    if (isHit) {
      // Base by ring + proximity bonus (closer to bullseye = more).
      const proximity = Math.max(0, target.outerRadius - hit.distance);
      points = hit.ringScore * 100 + Math.round(proximity);
      if (isBullseye) points += CONFIG.scoring.bullseyeBonus;
      this.combo += 1;
      if (this.combo > 1) {
        points = Math.round(points * (1 + (this.combo - 1) * CONFIG.scoring.comboStep));
      }
    } else {
      this.combo = 0;
    }

    this.score += points;

    let newBest = false;
    if (this.score > this.best) {
      this.best = this.score;
      newBest = true;
      save({ ...load(), highScore: this.best });
    }

    return {
      points,
      hit: isHit,
      bullseye: isBullseye,
      combo: this.combo,
      ringScore: hit.ringScore,
      newBest,
    };
  }
}
