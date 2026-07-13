// In-app level builder. Touch-first: pick a tool, then tap/drag on the canvas to
// place the target, draw bounce walls, or link portal pairs. Adjust wind and the
// level mode, then Test / Save / Share / Load. Levels are plain data (LevelSpec),
// so saving, sharing (base64 code), and remote publishing all reuse the same
// validated shape. (Dart/power-up catalogs arrive in Phase 5; this builder covers
// targets, walls, portals, wind, motion, and mode.)

import { CONFIG } from "../config";
import { LevelSpec } from "../data/schema";
import { exportCode, importCode } from "../data/sharecode";
import { addMyLevel, loadMyLevels } from "../storage";
import { Camera } from "../systems/camera";
import { Vec2 } from "../util/math";
import { Button, hitTest } from "./screens";

type Tool = "target" | "wall" | "portal";

function drawBtn(
  ctx: CanvasRenderingContext2D,
  b: Button,
  active: boolean,
  accent = "#57d1ff",
): void {
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  ctx.fillStyle = active ? "rgba(87,209,255,0.22)" : "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = active ? accent : "rgba(255,255,255,0.25)";
  ctx.stroke();
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

export class Workshop {
  private camera: Camera;
  private draft: LevelSpec = this.blank();
  private tool: Tool = "target";
  private toolButtons: Button<string>[] = [];
  private actionButtons: Button<string>[] = [];
  private loadButtons: Button<string>[] = [];
  private drawing = false;
  private wallStart: Vec2 | null = null;
  private wallEnd: Vec2 | null = null;
  private portalPending: Vec2 | null = null;
  private showLoad = false;
  private toast = "";
  private toastTime = 0;

  constructor(
    public viewW: number,
    public viewH: number,
    private onTest: (spec: LevelSpec) => void,
    private onExit: () => void,
  ) {
    this.camera = new Camera(viewW, viewH);
    this.layout();
    this.frame();
  }

  private blank(): LevelSpec {
    return {
      index: 1,
      gravity: CONFIG.physics.gravity,
      wind: { x: 0, y: 0 },
      target: { pos: { x: 1500, y: 700 }, rings: [...CONFIG.target.rings] },
      walls: [],
      portals: [],
      mode: "throw",
    };
  }

  reset(): void {
    this.draft = this.blank();
    this.tool = "target";
    this.portalPending = null;
    this.showLoad = false;
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.camera.resize(w, h);
    this.layout();
    this.frame();
  }

  private frame(): void {
    if (this.viewW <= 0) return;
    this.camera.setImmediate(
      this.camera.fitView([{ x: -200, y: -200 }, { x: 2900, y: 1800 }], 0.05),
    );
  }

  private layout(): void {
    const pad = 8;
    const tools: { id: string; label: string }[] = [
      { id: "target", label: "Target" },
      { id: "wall", label: "Wall" },
      { id: "portal", label: "Portal" },
      { id: "wind-", label: "Wind−" },
      { id: "wind+", label: "Wind+" },
      { id: "mode", label: "Mode" },
    ];
    const tw = (this.viewW - pad * 2 - (tools.length - 1) * 6) / tools.length;
    this.toolButtons = tools.map((t, i) => ({
      id: t.id,
      label: t.label,
      x: pad + i * (tw + 6),
      y: 8,
      w: tw,
      h: 36,
    }));

    const actions: { id: string; label: string }[] = [
      { id: "test", label: "Test" },
      { id: "save", label: "Save" },
      { id: "share", label: "Share" },
      { id: "load", label: "Load" },
      { id: "menu", label: "Menu" },
    ];
    const aw = (this.viewW - pad * 2 - (actions.length - 1) * 6) / actions.length;
    const ay = this.viewH - 54;
    this.actionButtons = actions.map((a, i) => ({
      id: a.id,
      label: a.label,
      x: pad + i * (aw + 6),
      y: ay,
      w: aw,
      h: 46,
    }));
  }

  private setToast(msg: string): void {
    this.toast = msg;
    this.toastTime = 2;
  }

  // -------------------------------------------------------------- pointer ----
  onPointerDown(x: number, y: number): void {
    if (this.showLoad) {
      const id = hitTest(this.loadButtons, x, y);
      if (id === "close") this.showLoad = false;
      else if (id === "import") void this.importFromClipboard();
      else if (id?.startsWith("load:")) {
        const idx = parseInt(id.slice(5), 10);
        const levels = loadMyLevels();
        if (levels[idx]) {
          this.draft = structuredClone(levels[idx]);
          this.showLoad = false;
          this.setToast("Loaded");
        }
      }
      return;
    }

    const tid = hitTest(this.toolButtons, x, y);
    if (tid) return this.onTool(tid);
    const aid = hitTest(this.actionButtons, x, y);
    if (aid) return this.onAction(aid);

    // Canvas interaction per active tool.
    const w = this.camera.screenToWorld({ x, y });
    if (this.tool === "target") {
      this.draft.target.pos = w;
    } else if (this.tool === "wall") {
      this.drawing = true;
      this.wallStart = w;
      this.wallEnd = w;
    } else if (this.tool === "portal") {
      if (this.portalPending) {
        this.draft.portals.push({
          a: { pos: this.portalPending, angle: 0 },
          b: { pos: w, angle: 0 },
          radius: 80,
          speedMult: 1,
        });
        this.portalPending = null;
      } else {
        this.portalPending = w;
      }
    }
  }

  onPointerMove(x: number, y: number): void {
    if (this.drawing) this.wallEnd = this.camera.screenToWorld({ x, y });
  }

  onPointerUp(): void {
    if (this.drawing && this.wallStart && this.wallEnd) {
      const dx = this.wallEnd.x - this.wallStart.x;
      const dy = this.wallEnd.y - this.wallStart.y;
      if (Math.hypot(dx, dy) > 40) {
        this.draft.walls.push({
          a: this.wallStart,
          b: this.wallEnd,
          restitution: 0.75,
          friction: 0.05,
        });
      }
    }
    this.drawing = false;
    this.wallStart = null;
    this.wallEnd = null;
  }

  private onTool(id: string): void {
    if (id === "target" || id === "wall" || id === "portal") {
      this.tool = id;
      this.portalPending = null;
    } else if (id === "wind-") {
      this.draft.wind.x = Math.max(-400, this.draft.wind.x - 40);
    } else if (id === "wind+") {
      this.draft.wind.x = Math.min(400, this.draft.wind.x + 40);
    } else if (id === "mode") {
      this.draft.mode = this.draft.mode === "predict" ? "throw" : "predict";
    }
  }

  private onAction(id: string): void {
    if (id === "test") {
      this.onTest(structuredClone(this.draft));
    } else if (id === "save") {
      addMyLevel(structuredClone(this.draft));
      this.setToast("Saved to My Levels");
    } else if (id === "share") {
      const code = exportCode(this.draft);
      void navigator.clipboard?.writeText(code).catch(() => {});
      this.setToast("Share code copied");
    } else if (id === "load") {
      this.buildLoadList();
      this.showLoad = true;
    } else if (id === "menu") {
      this.onExit();
    }
  }

  private async importFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const lv = importCode(text);
      if (lv) {
        this.draft = lv;
        this.showLoad = false;
        this.setToast("Imported from clipboard");
      } else {
        this.setToast("No valid code on clipboard");
      }
    } catch {
      this.setToast("Clipboard unavailable");
    }
  }

  private buildLoadList(): void {
    const levels = loadMyLevels();
    const w = Math.min(300, this.viewW - 48);
    const x = (this.viewW - w) / 2;
    let y = 120;
    const btns: Button<string>[] = levels.map((_, i) => {
      const b: Button<string> = { id: `load:${i}`, label: `My Level ${i + 1}`, x, y, w, h: 40 };
      y += 48;
      return b;
    });
    btns.push({ id: "import", label: "Import from clipboard", x, y, w, h: 44 });
    y += 52;
    btns.push({ id: "close", label: "Close", x, y, w, h: 44 });
    this.loadButtons = btns;
  }

  update(dt: number): void {
    this.camera.update(dt);
    if (this.toastTime > 0) this.toastTime -= dt;
  }

  // --------------------------------------------------------------- render ----
  render(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#161d33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    this.drawLaunch(ctx);
    this.drawWalls(ctx);
    this.drawPortals(ctx);
    this.drawTarget(ctx);
    this.drawTransient(ctx);

    // Tool palette + status.
    for (const b of this.toolButtons) drawBtn(ctx, b, this.tool === b.id);
    for (const b of this.actionButtons) drawBtn(ctx, b, false, "#3ddc84");

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(234,242,255,0.7)";
    ctx.font = "600 13px system-ui, sans-serif";
    const hint =
      this.tool === "target"
        ? "Tap to place the target"
        : this.tool === "wall"
          ? "Drag to draw a bounce wall"
          : this.portalPending
            ? "Tap to place the exit portal"
            : "Tap to place the entry portal";
    ctx.fillText(hint, this.viewW / 2, 52);
    ctx.fillStyle = "rgba(143,183,255,0.9)";
    ctx.fillText(
      `wind ${Math.round(this.draft.wind.x)}  ·  mode ${this.draft.mode}  ·  walls ${this.draft.walls.length}  ·  portals ${this.draft.portals.length}`,
      this.viewW / 2,
      72,
    );

    if (this.toastTime > 0) {
      ctx.fillStyle = "rgba(6,10,20,0.85)";
      ctx.fillRect(0, this.viewH - 110, this.viewW, 30);
      ctx.fillStyle = "#3ddc84";
      ctx.font = "700 15px system-ui, sans-serif";
      ctx.fillText(this.toast, this.viewW / 2, this.viewH - 103);
    }

    if (this.showLoad) this.drawLoad(ctx);
  }

  private drawLaunch(ctx: CanvasRenderingContext2D): void {
    const s = this.camera.worldToScreen({ x: 0, y: 0 });
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(234,242,255,0.6)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("LAUNCH", s.x, s.y - 8);
  }

  private drawTarget(ctx: CanvasRenderingContext2D): void {
    const c = this.camera.worldToScreen(this.draft.target.pos);
    const colors = ["#3a6ea5", "#e8f0ff", "#e5484d", "#ffd166"];
    const rings = this.draft.target.rings;
    for (let i = 0; i < rings.length; i++) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, rings[i] * this.camera.scale, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D): void {
    for (const w of this.draft.walls) {
      const a = this.camera.worldToScreen(w.a);
      const b = this.camera.worldToScreen(w.b);
      ctx.strokeStyle = "#e6b45a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  private drawPortals(ctx: CanvasRenderingContext2D): void {
    for (const p of this.draft.portals) {
      for (const [gate, color] of [
        [p.a, "rgb(120,90,255)"],
        [p.b, "rgb(255,140,60)"],
      ] as const) {
        const s = this.camera.worldToScreen(gate.pos);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.radius * this.camera.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawTransient(ctx: CanvasRenderingContext2D): void {
    if (this.drawing && this.wallStart && this.wallEnd) {
      const a = this.camera.worldToScreen(this.wallStart);
      const b = this.camera.worldToScreen(this.wallEnd);
      ctx.strokeStyle = "rgba(230,180,90,0.7)";
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.portalPending) {
      const s = this.camera.worldToScreen(this.portalPending);
      ctx.strokeStyle = "rgb(120,90,255)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 80 * this.camera.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawLoad(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(6,10,20,0.82)";
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("My Levels", this.viewW / 2, 92);
    if (this.loadButtons.length <= 2) {
      ctx.fillStyle = "rgba(234,242,255,0.6)";
      ctx.font = "500 14px system-ui, sans-serif";
      ctx.fillText("No saved levels yet", this.viewW / 2, 132);
    }
    for (const b of this.loadButtons) {
      drawBtn(ctx, b, false, b.id === "close" ? "#e5484d" : "#57d1ff");
    }
  }
}
