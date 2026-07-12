// Heads-up display drawn in screen space. The signature feature is the pair of
// edge gauges that report how far the (offscreen) target is in X and Y — this is
// the only information the player has while aiming blind.

import { CONFIG } from "../config";
import { clamp, Vec2 } from "../util/math";

export interface HudData {
  offset: Vec2; // target position relative to launch (world units)
  wind: Vec2; // constant wind acceleration for this level
  level: number;
  power: number; // 0..1, or negative when not aiming
  score: number;
  best: number;
  combo: number;
  message?: string;
}

const COL_TRACK = "rgba(255,255,255,0.12)";
const COL_FILL = "#57d1ff";
const COL_TEXT = "#eaf2ff";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class Hud {
  constructor(public viewW: number, public viewH: number) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  render(ctx: CanvasRenderingContext2D, d: HudData): void {
    this.drawXGauge(ctx, d.offset.x);
    this.drawYGauge(ctx, d.offset.y);
    if (d.power >= 0) this.drawPower(ctx, d.power);
    this.drawScore(ctx, d.score, d.best, d.combo, d.level);
    this.drawWind(ctx, d.wind);
    if (d.message) this.drawMessage(ctx, d.message);
  }

  // Horizontal gauge across the top edge: fill grows from center toward the side
  // the target lies on; the number is the absolute X distance.
  private drawXGauge(ctx: CanvasRenderingContext2D, dx: number): void {
    const pad = CONFIG.hud.edgePadding;
    const th = CONFIG.hud.gaugeThickness;
    const y = pad + 18;
    const x = pad + 60;
    const w = this.viewW - (pad + 60) - pad;
    const cx = x + w / 2;

    ctx.fillStyle = COL_TRACK;
    roundRect(ctx, x, y, w, th, th / 2);
    ctx.fill();

    const norm = clamp(dx / CONFIG.target.maxX, -1, 1);
    const fillW = (Math.abs(norm) * w) / 2;
    ctx.fillStyle = COL_FILL;
    if (norm >= 0) {
      roundRect(ctx, cx, y, fillW, th, th / 2);
    } else {
      roundRect(ctx, cx - fillW, y, fillW, th, th / 2);
    }
    ctx.fill();

    // center tick
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(cx - 1, y - 3, 2, th + 6);

    const arrow = dx >= 0 ? "→" : "←";
    ctx.fillStyle = COL_TEXT;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("X", pad, y + th / 2);
    ctx.textAlign = "center";
    ctx.fillText(`${arrow} ${Math.round(Math.abs(dx))}`, cx, y + th + 16);
  }

  // Vertical gauge down the right edge: fill grows from center up/down toward the
  // target; number is the absolute Y distance.
  private drawYGauge(ctx: CanvasRenderingContext2D, dy: number): void {
    const pad = CONFIG.hud.edgePadding;
    const th = CONFIG.hud.gaugeThickness;
    const x = this.viewW - pad - th;
    const top = pad + 70;
    const bottom = this.viewH - pad - 40;
    const h = bottom - top;
    const cy = top + h / 2;

    ctx.fillStyle = COL_TRACK;
    roundRect(ctx, x, top, th, h, th / 2);
    ctx.fill();

    const norm = clamp(dy / CONFIG.target.maxY, -1, 1);
    const fillH = (Math.abs(norm) * h) / 2;
    ctx.fillStyle = COL_FILL;
    if (norm >= 0) {
      roundRect(ctx, x, cy - fillH, th, fillH, th / 2); // up
    } else {
      roundRect(ctx, x, cy, th, fillH, th / 2); // down
    }
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(x - 3, cy - 1, th + 6, 2);

    const arrow = dy >= 0 ? "↑" : "↓";
    ctx.fillStyle = COL_TEXT;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText("Y", this.viewW - pad, top - 16);
    ctx.save();
    ctx.translate(x - 8, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(`${arrow} ${Math.round(Math.abs(dy))}`, 0, 0);
    ctx.restore();
  }

  private drawPower(ctx: CanvasRenderingContext2D, power: number): void {
    const pad = CONFIG.hud.edgePadding;
    const w = 10;
    const h = 140;
    const x = pad;
    const y = this.viewH - pad - h;

    ctx.fillStyle = COL_TRACK;
    roundRect(ctx, x, y, w, h, w / 2);
    ctx.fill();

    const fillH = power * h;
    // Green -> yellow -> red as power climbs.
    const hue = 120 - power * 120;
    ctx.fillStyle = `hsl(${hue}, 85%, 55%)`;
    roundRect(ctx, x, y + h - fillH, w, fillH, w / 2);
    ctx.fill();

    ctx.fillStyle = COL_TEXT;
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${Math.round(power * 100)}%`, x, y - 6);
  }

  private drawScore(
    ctx: CanvasRenderingContext2D,
    score: number,
    best: number,
    combo: number,
    level: number,
  ): void {
    const pad = CONFIG.hud.edgePadding;
    ctx.fillStyle = COL_TEXT;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${score}`, pad, pad);

    ctx.fillStyle = "rgba(234,242,255,0.55)";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillText(`BEST ${best}  ·  LV ${level}`, pad, pad + 26);

    if (combo > 1) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.fillText(`x${combo} combo`, pad, pad + 44);
    }
  }

  // Wind indicator: an arrow (in wind direction) + magnitude near top-center.
  private drawWind(ctx: CanvasRenderingContext2D, wind: Vec2): void {
    const mag = Math.hypot(wind.x, wind.y);
    const cx = this.viewW / 2;
    const cy = 74;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (mag < 1) {
      ctx.fillStyle = "rgba(234,242,255,0.5)";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText("CALM", cx, cy);
      return;
    }

    // Arrow: wind blows in +x right / (screen) up when wind.y>0 (world +y up).
    const ux = wind.x / mag;
    const uy = -wind.y / mag; // flip to screen
    const L = 22;
    const tipX = cx + ux * L;
    const tipY = cy + uy * L;
    ctx.strokeStyle = "#8fb7ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - ux * L, cy - uy * L);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    const a = Math.atan2(uy, ux);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(a);
    ctx.fillStyle = "#8fb7ff";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(234,242,255,0.7)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(`WIND ${Math.round(mag)}`, cx, cy + 20);
  }

  private drawMessage(ctx: CanvasRenderingContext2D, msg: string): void {
    ctx.fillStyle = COL_TEXT;
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(msg, this.viewW / 2, this.viewH - CONFIG.hud.edgePadding - 4);
  }
}
