// Simple canvas UI: a main menu that lists game modes and a game-over overlay.
// Buttons are plain rectangles hit-tested against pointer taps — no DOM.

export interface Button<T extends string = string> {
  id: T;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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

export function hitTest<T extends string>(buttons: Button<T>[], x: number, y: number): T | null {
  for (const b of buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
  }
  return null;
}

function drawButton(ctx: CanvasRenderingContext2D, b: Button, accent: string): void {
  roundRect(ctx, b.x, b.y, b.w, b.h, 14);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "700 20px system-ui, sans-serif";
  const ty = b.sub ? b.y + b.h / 2 - 9 : b.y + b.h / 2;
  ctx.fillText(b.label, b.x + 18, ty);
  if (b.sub) {
    ctx.fillStyle = "rgba(234,242,255,0.55)";
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(b.sub, b.x + 18, b.y + b.h / 2 + 12);
  }
}

export type MenuId = "endless" | "timeattack" | "daily" | "predict";

const ACCENTS: Record<MenuId, string> = {
  endless: "#57d1ff",
  timeattack: "#3ddc84",
  daily: "#ffd166",
  predict: "#c08bff",
};

export class Menu {
  buttons: Button<MenuId>[] = [];

  constructor(public viewW: number, public viewH: number) {
    this.layout();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.layout();
  }

  private layout(): void {
    const defs: { id: MenuId; label: string; sub: string }[] = [
      { id: "endless", label: "Endless", sub: "Keep throwing, chase your best" },
      { id: "timeattack", label: "Time Attack", sub: "Most points in 60 seconds" },
      { id: "daily", label: "Daily Challenge", sub: "Limited tries · beat the passing score" },
      { id: "predict", label: "Prediction", sub: "Guess where the dart lands" },
    ];
    const w = Math.min(320, this.viewW - 48);
    const h = 66;
    const gap = 14;
    const totalH = defs.length * h + (defs.length - 1) * gap;
    const x = (this.viewW - w) / 2;
    let y = this.viewH * 0.5 - totalH / 2 + 40;
    this.buttons = defs.map((d) => {
      const b: Button<MenuId> = { ...d, x, y, w, h };
      y += h + gap;
      return b;
    });
  }

  render(ctx: CanvasRenderingContext2D, best: number, streak: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#161d33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "800 40px system-ui, sans-serif";
    ctx.fillText("BLIND SHOT", this.viewW / 2, this.viewH * 0.26);
    ctx.fillStyle = "rgba(234,242,255,0.6)";
    ctx.font = "500 15px system-ui, sans-serif";
    ctx.fillText("Throw at the target you can't see", this.viewW / 2, this.viewH * 0.26 + 26);

    ctx.fillStyle = "rgba(234,242,255,0.75)";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(`BEST ${best}   ·   DAILY STREAK ${streak}`, this.viewW / 2, this.viewH * 0.26 + 52);

    for (const b of this.buttons) drawButton(ctx, b, ACCENTS[b.id]);
  }
}

export type GameOverId = "retry" | "menu";

export class GameOverScreen {
  buttons: Button<GameOverId>[] = [];

  constructor(public viewW: number, public viewH: number) {
    this.layout();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.layout();
  }

  private layout(): void {
    const w = Math.min(150, (this.viewW - 60) / 2);
    const h = 56;
    const cx = this.viewW / 2;
    const y = this.viewH * 0.62;
    this.buttons = [
      { id: "retry", label: "Retry", x: cx - w - 8, y, w, h },
      { id: "menu", label: "Menu", x: cx + 8, y, w, h },
    ];
  }

  render(ctx: CanvasRenderingContext2D, title: string, lines: string[], titleColor: string): void {
    ctx.fillStyle = "rgba(6,10,20,0.72)";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const cx = this.viewW / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = titleColor;
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.fillText(title, cx, this.viewH * 0.36);

    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillStyle = "#eaf2ff";
    let y = this.viewH * 0.36 + 40;
    for (const line of lines) {
      ctx.fillText(line, cx, y);
      y += 26;
    }

    for (const b of this.buttons) drawButton2(ctx, b);
  }
}

function drawButton2(ctx: CanvasRenderingContext2D, b: Button): void {
  roundRect(ctx, b.x, b.y, b.w, b.h, 14);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#57d1ff";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
}
