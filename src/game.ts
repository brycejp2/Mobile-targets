// Top-level game: owns the state machine, world, and systems, and orchestrates
// update + render. Phase 1 loop: AIMING -> IN_FLIGHT -> REVEAL -> RESULT.

import { CONFIG } from "./config";
import { Dart } from "./entities/dart";
import { World } from "./entities/world";
import { Camera } from "./systems/camera";
import { Hud } from "./systems/hud";
import { InputController } from "./systems/input";
import { Particles } from "./systems/particles";
import { Scoring, ScoreEvent } from "./systems/scoring";
import { clamp, dist, lerp, Vec2 } from "./util/math";
import { Rng } from "./util/rng";

type State = "AIMING" | "IN_FLIGHT" | "REVEAL" | "RESULT";

export class Game {
  private rng = new Rng();
  private world = new World(this.rng);
  private dart = new Dart(this.world.launch);
  private camera: Camera;
  private hud: Hud;
  private input = new InputController();
  private scoring = new Scoring();
  private particles = new Particles();

  private state: State = "AIMING";
  private stateTime = 0;
  private timeScale = 1; // bullet-time factor for the simulation

  private closestDist = Infinity;
  private closestPos: Vec2 = { ...this.world.launch };
  private impact: Vec2 | null = null;
  private lastEvent: ScoreEvent | null = null;

  constructor(private viewW: number, private viewH: number) {
    this.camera = new Camera(viewW, viewH);
    this.hud = new Hud(viewW, viewH);
    this.newRound();
  }

  onResize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.camera.resize(w, h);
    this.hud.resize(w, h);
    if (this.state === "AIMING") this.frameAim();
  }

  // --- Round lifecycle ---
  private newRound(): void {
    this.world.spawnTarget(this.rng);
    this.dart = new Dart(this.world.launch);
    this.state = "AIMING";
    this.stateTime = 0;
    this.impact = null;
    this.lastEvent = null;
    this.closestDist = Infinity;
    this.closestPos = { ...this.world.launch };
    this.timeScale = 1;
    this.particles.clear();
    this.input.end();
    this.frameAim();
  }

  private frameAim(): void {
    if (this.viewW <= 0) return;
    this.camera.setImmediate(this.camera.aimView(this.world.launch));
  }

  private launchDart(): void {
    this.dart.launch(this.input.launchVelocity());
    this.state = "IN_FLIGHT";
    this.stateTime = 0;
    this.closestDist = Infinity;
    this.closestPos = { ...this.world.launch };
    this.input.end();
    // Zoom out to reveal the whole throw as the dart travels.
    const view = this.camera.fitView(
      [this.world.launch, this.world.target.pos],
      CONFIG.camera.aimZoomPadding,
      this.world.target.outerRadius,
    );
    this.camera.animateTo(view, CONFIG.camera.revealDuration);
  }

  private finishThrow(): void {
    const impact = this.impact!;
    const hit = this.world.target.evaluate(impact);
    const ev = this.scoring.record(hit, this.world.target);
    this.lastEvent = ev;

    // Impact feedback: particles + screen shake, bigger for a bullseye.
    if (ev.hit) {
      const color = ev.bullseye ? "#ffd166" : "#57d1ff";
      this.particles.burst(impact, color, ev.bullseye ? 42 : 26, 520);
      this.camera.addShake(ev.bullseye ? CONFIG.shake.bullseyeMag : CONFIG.shake.hitMag);
    } else {
      this.particles.burst(impact, "#6b7690", 12, 260);
    }

    this.state = "REVEAL";
    this.stateTime = 0;
    this.timeScale = 1;
    const view = this.camera.fitView(
      [this.world.launch, this.world.target.pos, impact, ...this.dart.trail],
      CONFIG.camera.aimZoomPadding,
      this.world.target.outerRadius,
    );
    this.camera.animateTo(view, 0.5);
  }

  // Bullet-time ramps in as the in-flight dart approaches the target.
  private desiredTimeScale(): number {
    if (this.state !== "IN_FLIGHT") return 1;
    const d = dist(this.dart.pos, this.world.target.pos);
    const trigger = CONFIG.slowmo.triggerDist;
    if (d >= trigger) return 1;
    const t = clamp(d / trigger, 0, 1);
    return lerp(CONFIG.slowmo.minScale, 1, t);
  }

  // --- Input ---
  onPointerDown(x: number, y: number): void {
    if (this.state === "AIMING") this.input.begin(x, y);
    else if (this.state === "RESULT") this.newRound();
  }

  onPointerMove(x: number, y: number): void {
    if (this.state === "AIMING" && this.input.active) this.input.move(x, y);
  }

  onPointerUp(x: number, y: number): void {
    if (this.state === "AIMING" && this.input.active) {
      this.input.move(x, y);
      if (this.input.power() >= 0.05) this.launchDart();
      else this.input.end();
    }
  }

  // --- Update ---
  update(dt: number): void {
    this.camera.update(dt); // camera uses real time (shake/framing unaffected by slow-mo)
    this.stateTime += dt;

    // Ease the simulation time scale toward its target (bullet-time near the target).
    const desired = this.desiredTimeScale();
    this.timeScale = lerp(this.timeScale, desired, Math.min(1, CONFIG.slowmo.ramp * dt));
    const simDt = dt * this.timeScale;

    this.particles.update(simDt);

    if (this.state === "IN_FLIGHT") {
      const landed = this.dart.step(simDt);
      const target = this.world.target;
      const d = dist(this.dart.pos, target.pos);
      if (d < this.closestDist) {
        this.closestDist = d;
        this.closestPos = { ...this.dart.pos };
      }
      // Passed the target horizontally without hitting -> resolve as a miss at
      // the closest approach, rather than waiting for the long fall to ground.
      const passedTarget = this.dart.pos.x >= target.pos.x;
      if (d <= target.outerRadius) {
        // Stick the dart in the target.
        this.dart.inFlight = false;
        this.impact = { ...this.dart.pos };
        this.finishThrow();
      } else if (passedTarget || landed) {
        this.impact = { ...this.closestPos };
        this.finishThrow();
      }
    } else if (this.state === "REVEAL") {
      if (!this.camera.settling && this.stateTime > 0.6) {
        this.state = "RESULT";
        this.stateTime = 0;
      }
    }
  }

  // --- Render ---
  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    this.drawBackground(ctx);
    this.drawTarget(ctx);
    this.drawDart(ctx);
    this.particles.render(ctx, this.camera);
    if (this.state === "AIMING" && this.input.active) this.drawAimHelpers(ctx);

    let message: string | undefined;
    if (this.state === "AIMING") message = "Drag anywhere to aim · release to throw";
    this.hud.render(ctx, {
      offset: this.world.targetOffset(),
      power: this.state === "AIMING" && this.input.active ? this.input.power() : -1,
      score: this.scoring.score,
      best: this.scoring.best,
      combo: this.scoring.combo,
      message,
    });

    if (this.state === "RESULT" || this.state === "REVEAL") this.drawResult(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#161d33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  private drawTarget(ctx: CanvasRenderingContext2D): void {
    const t = this.world.target;
    const c = this.camera.worldToScreen(t.pos);
    const ringColors = ["#3a6ea5", "#e8f0ff", "#e5484d", "#ffd166"];
    for (let i = 0; i < t.rings.length; i++) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, t.rings[i] * this.camera.scale, 0, Math.PI * 2);
      ctx.fillStyle = ringColors[i % ringColors.length];
      ctx.fill();
    }
    // bullseye dot
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(2, 8 * this.camera.scale), 0, Math.PI * 2);
    ctx.fillStyle = "#0b1020";
    ctx.fill();
  }

  private drawDart(ctx: CanvasRenderingContext2D): void {
    const p = this.camera.worldToScreen(this.dart.pos);
    // Heading: world -> screen flips y.
    let angle: number;
    if (this.state === "AIMING") {
      const dir = this.input.active
        ? this.input.launchDir()
        : { x: 0.7, y: 0.7 };
      angle = Math.atan2(-dir.y, dir.x);
    } else {
      const h = this.dart.heading;
      angle = Math.atan2(-Math.sin(h), Math.cos(h));
    }

    // Trail
    if (this.dart.trail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < this.dart.trail.length; i++) {
        const s = this.camera.worldToScreen(this.dart.trail[i]);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = "rgba(87,209,255,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const L = CONFIG.dartLengthPx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    // shaft
    ctx.strokeStyle = "#eaf2ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-L * 0.6, 0);
    ctx.lineTo(L * 0.4, 0);
    ctx.stroke();
    // tip
    ctx.beginPath();
    ctx.moveTo(L * 0.4, 0);
    ctx.lineTo(L * 0.4 - 8, -5);
    ctx.lineTo(L * 0.4 - 8, 5);
    ctx.closePath();
    ctx.fillStyle = "#57d1ff";
    ctx.fill();
    // fletching
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.6, 0);
    ctx.lineTo(-L * 0.6 - 6, -5);
    ctx.moveTo(-L * 0.6, 0);
    ctx.lineTo(-L * 0.6 - 6, 5);
    ctx.stroke();
    ctx.restore();
  }

  private drawAimHelpers(ctx: CanvasRenderingContext2D): void {
    const launch = this.camera.worldToScreen(this.world.launch);
    const drag = this.input.dragScreen();

    // Sling line from launch to the finger.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(launch.x + drag.x, launch.y + drag.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Short launch-direction arrow (deliberately NOT a full trajectory).
    const dir = this.input.launchDir();
    const power = this.input.power();
    const len = 40 + power * 70;
    const ax = launch.x + dir.x * len;
    const ay = launch.y - dir.y * len;
    ctx.strokeStyle = "#57d1ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const a = Math.atan2(-dir.y, dir.x);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.fillStyle = "#57d1ff";
    ctx.fill();
    ctx.restore();
  }

  private drawResult(ctx: CanvasRenderingContext2D): void {
    const ev = this.lastEvent;
    if (!ev) return;

    if (this.state === "RESULT") {
      ctx.fillStyle = "rgba(6,10,20,0.55)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    const cx = this.viewW / 2;
    const cy = this.viewH * 0.4;
    ctx.textAlign = "center";

    const title = ev.hit
      ? ev.ringScore >= this.world.target.rings.length
        ? "BULLSEYE!"
        : "HIT!"
      : "MISS";
    ctx.fillStyle = ev.hit ? "#3ddc84" : "#e5484d";
    ctx.font = "800 42px system-ui, sans-serif";
    ctx.fillText(title, cx, cy);

    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(ev.points > 0 ? `+${ev.points}` : "no points", cx, cy + 40);

    if (ev.newBest && ev.points > 0) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillText("★ NEW BEST ★", cx, cy + 68);
    }

    if (this.state === "RESULT") {
      ctx.fillStyle = "rgba(234,242,255,0.8)";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillText("Tap to throw again", cx, cy + 100);
    }
  }
}
