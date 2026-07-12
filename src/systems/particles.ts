// World-space particle bursts for impact feedback. Particles live in world
// coordinates so they stay anchored to the hit point as the reveal camera moves.

import { Camera } from "./camera";
import { Vec2 } from "../util/math";

interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class Particles {
  private items: Particle[] = [];

  burst(at: Vec2, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = 0.35 + Math.random() * 0.5;
      this.items.push({
        pos: { ...at },
        vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  clear(): void {
    this.items.length = 0;
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life -= dt;
      p.vel.y -= 600 * dt; // gentle gravity (+y up)
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const p of this.items) {
      const s = camera.worldToScreen(p.pos);
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  get count(): number {
    return this.items.length;
  }
}
