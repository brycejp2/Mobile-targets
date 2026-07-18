// Top-level game: owns the state machine, world, systems, and game modes, and
// orchestrates update + render.
//
// States: MENU -> (AIMING | PREDICT) -> IN_FLIGHT -> REVEAL -> RESULT -> ... -> GAME_OVER
// Modes: endless, timeattack, daily (limited tries + passing score), predict.

import { CONFIG } from "./config";
import {
  generateDailyLevel,
  generateLevel,
  generatePredictLevel,
  LevelSpec,
} from "./data/schema";
import { Dart } from "./entities/dart";
import { World } from "./entities/world";
import { Camera } from "./systems/camera";
import { CollisionState, stepCollisions } from "./systems/collision";
import { Hud } from "./systems/hud";
import { InputController } from "./systems/input";
import { Particles } from "./systems/particles";
import { integrate } from "./systems/physics";
import { Scoring } from "./systems/scoring";
import { Content, loadContent } from "./systems/content";
import { GameOverScreen, hitTest, Menu, MenuId } from "./ui/screens";
import { Workshop } from "./ui/workshop";
import { recordDaily, load as loadSave, todayKey } from "./storage";
import { clamp, dist, lerp, Vec2 } from "./util/math";
import { Rng, seedFromString } from "./util/rng";

type State =
  | "MENU"
  | "WORKSHOP"
  | "AIMING"
  | "PREDICT"
  | "IN_FLIGHT"
  | "REVEAL"
  | "RESULT"
  | "GAME_OVER";
type Mode = "endless" | "timeattack" | "daily" | "predict";

interface RoundResult {
  title: string;
  color: string;
  points: number;
  sub?: string;
  newBest: boolean;
  hit: boolean;
}

export class Game {
  private rng = new Rng();
  private levelIndex = 1;
  private world = new World(generateLevel(this.levelIndex, this.rng));
  private dart = new Dart(this.world.launch);
  private camera: Camera;
  private hud: Hud;
  private menu: Menu;
  private gameOver: GameOverScreen;
  private workshop: Workshop | null = null;
  private content: Content | null = null;
  private resumeWorkshop = false;
  private dailyLevel: LevelSpec | null = null;
  private backBtn = { x: 0, y: 0, w: 0, h: 0 };
  private zoomInBtn = { x: 0, y: 0, w: 0, h: 0 };
  private zoomOutBtn = { x: 0, y: 0, w: 0, h: 0 };
  private input = new InputController();
  private scoring = new Scoring();
  private particles = new Particles();
  private collision: CollisionState = { portalCooldown: 0 };

  private state: State = "MENU";
  private stateTime = 0;
  private timeScale = 1;
  private targetClock = 0;

  private closestDist = Infinity;
  private closestPos: Vec2 = { ...this.world.launch };
  private impact: Vec2 | null = null;
  private lastResult: RoundResult | null = null;

  // Mode run-state.
  private mode: Mode = "endless";
  private timeLeft = 0;
  private attemptsLeft = 0;
  private passingScore = 0;
  private dailyDate = "";
  private dailyOfficial = false;
  private predictVel: Vec2 = { x: 0, y: 0 };
  private predictGuess: Vec2 | null = null;
  private predictRoundsLeft = 0;
  private gameOverTitle = "";
  private gameOverColor = "#eaf2ff";
  private gameOverLines: string[] = [];
  private predictLock = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private viewW: number, private viewH: number) {
    this.camera = new Camera(viewW, viewH);
    this.hud = new Hud(viewW, viewH);
    this.menu = new Menu(viewW, viewH);
    this.gameOver = new GameOverScreen(viewW, viewH);
    // Fetch runtime-published content (levels + daily) in the background.
    void loadContent().then((c) => (this.content = c));
  }

  onResize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.camera.resize(w, h);
    this.hud.resize(w, h);
    this.menu.resize(w, h);
    this.gameOver.resize(w, h);
    this.workshop?.resize(w, h);
    this.backBtn = { x: w - 46, y: 12, w: 34, h: 34 };
    this.zoomInBtn = { x: 12, y: h / 2 - 46, w: 38, h: 38 };
    this.zoomOutBtn = { x: 12, y: h / 2 + 2, w: 38, h: 38 };
    if (this.state === "AIMING") this.frameAim();
    else if (this.state === "PREDICT") this.framePredict();
  }

  // Route a menu selection (may open the workshop rather than a play mode).
  private startMenuChoice(id: MenuId): void {
    if (id === "workshop") {
      this.openWorkshop();
    } else {
      this.startMode(id);
    }
  }

  private openWorkshop(): void {
    if (!this.workshop) {
      this.workshop = new Workshop(
        this.viewW,
        this.viewH,
        (spec) => {
          this.resumeWorkshop = true;
          this.loadLevel(spec);
        },
        () => {
          this.state = "MENU";
        },
      );
    }
    this.state = "WORKSHOP";
  }

  // ---------------------------------------------------------------- Modes ----
  private startMode(mode: Mode): void {
    this.mode = mode;
    this.scoring.reset();
    this.levelIndex = 0;
    this.timeLeft = CONFIG.modes.timeAttackSeconds;
    this.resumeWorkshop = false;
    if (mode === "daily") {
      this.dailyDate = todayKey();
      const save = loadSave();
      this.dailyOfficial = !save.daily[this.dailyDate]?.played;
      // Prefer a remotely-published daily for today; else generate one.
      this.dailyLevel =
        this.content?.daily[this.dailyDate] ?? generateDailyLevel(seedFromString(this.dailyDate));
      this.attemptsLeft = this.dailyLevel.attempts ?? CONFIG.modes.dailyAttempts;
      this.passingScore = this.dailyLevel.passingScore ?? CONFIG.modes.dailyPassingScore;
      this.startThrowRound();
    } else if (mode === "predict") {
      this.predictRoundsLeft = CONFIG.modes.predictRounds;
      this.startPredictRound();
    } else {
      this.startThrowRound();
    }
  }

  // A throw round for endless / timeattack / daily.
  private startThrowRound(): void {
    if (this.mode === "daily") {
      // Every attempt plays the same daily level (fixed per date).
      this.world.load(structuredClone(this.dailyLevel!));
    } else {
      this.levelIndex += 1;
      this.world.load(generateLevel(this.levelIndex, this.rng));
    }
    this.beginRoundCommon("AIMING");
    this.frameRoundStart();
  }

  private startPredictRound(): void {
    const { level, velocity } = generatePredictLevel(this.rng, 5);
    this.world.load(level);
    this.predictVel = velocity;
    this.predictGuess = null;
    this.beginRoundCommon("PREDICT");
    this.framePredict();
  }

  private beginRoundCommon(state: State): void {
    this.dart = new Dart(this.world.launch);
    this.state = state;
    this.stateTime = 0;
    this.impact = null;
    this.lastResult = null;
    this.closestDist = Infinity;
    this.closestPos = { ...this.world.launch };
    this.timeScale = 1;
    this.targetClock = 0;
    this.collision.portalCooldown = 0;
    this.particles.clear();
    this.input.end();
  }

  private frameAim(): void {
    if (this.viewW <= 0) return;
    this.camera.setImmediate(this.camera.aimView(this.world.launch));
  }

  // World points that bound the whole level (for framing).
  private levelPoints(): Vec2[] {
    const pts: Vec2[] = [this.world.launch, this.world.target.pos];
    for (const w of this.world.level.walls) pts.push(w.a, w.b);
    for (const p of this.world.level.portals) pts.push(p.a.pos, p.b.pos);
    return pts;
  }

  // Frame the round's opening. Blind levels: show the whole level, then zoom in
  // to the dart. Thrown-target levels stay wide (static) so the player can track
  // the airborne target and lead the shot.
  private frameRoundStart(): void {
    if (this.viewW <= 0) return;
    if (this.world.target.thrown) {
      this.camera.setImmediate(this.thrownView());
    } else {
      const wide = this.camera.fitView(
        this.levelPoints(),
        CONFIG.camera.aimZoomPadding,
        this.world.target.outerRadius,
      );
      this.camera.setImmediate(wide);
      this.camera.animateTo(this.camera.aimView(this.world.launch), CONFIG.camera.introDuration);
    }
  }

  // A static view that bounds a thrown target's whole arc (start, apex, landing)
  // plus the launch point, so the entire skeet-shot is visible.
  private thrownView() {
    const g = Math.max(1, this.world.level.gravity); // avoid /0 for gravity-free levels
    const groundY = CONFIG.physics.groundY;
    const p0 = this.world.target.base;
    const v = this.world.target.vel;
    const tApex = Math.max(0, v.y / g);
    const apex = { x: p0.x + v.x * tApex, y: p0.y + (v.y > 0 ? (v.y * v.y) / (2 * g) : 0) };
    const tGround = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * g * (p0.y - groundY)))) / g;
    const land = { x: p0.x + v.x * tGround, y: groundY };
    return this.camera.fitView(
      [this.world.launch, p0, apex, land],
      CONFIG.camera.aimZoomPadding,
      this.world.target.outerRadius,
    );
  }

  private framePredict(): void {
    if (this.viewW <= 0) return;
    // Prediction isn't blind: show launch + target so the player can reason.
    const view = this.camera.fitView(
      [this.world.launch, this.world.target.pos],
      CONFIG.camera.aimZoomPadding,
      this.world.target.outerRadius,
    );
    this.camera.setImmediate(view);
  }

  // Load an explicit level (demo levels / automated tests) as an endless round.
  loadLevel(spec: LevelSpec): void {
    this.mode = "endless";
    this.levelIndex = spec.index;
    this.world.load(spec);
    this.beginRoundCommon("AIMING");
    this.frameRoundStart();
  }

  // --------------------------------------------------------------- Throwing --
  private launchDart(): void {
    this.beginFlight(this.input.launchVelocity());
    this.input.end();
  }

  private beginFlight(velocity: Vec2): void {
    this.dart.launch(velocity);
    this.state = "IN_FLIGHT";
    this.stateTime = 0;
    this.closestDist = Infinity;
    this.closestPos = { ...this.world.launch };
    this.collision.portalCooldown = 0;
    // Thrown-target rounds keep the static wide view (track the target); blind
    // rounds zoom out to reveal the whole throw.
    if (!this.world.target.thrown) {
      const view = this.camera.fitView(
        [this.world.launch, this.world.target.pos],
        CONFIG.camera.aimZoomPadding,
        this.world.target.outerRadius,
      );
      this.camera.animateTo(view, CONFIG.camera.revealDuration);
    }
  }

  // Give the player another shot while a thrown target is still airborne.
  private rearm(): void {
    this.dart = new Dart(this.world.launch);
    this.state = "AIMING";
    this.input.end();
  }

  // The thrown target hit the ground unhit — the round is failed.
  private failRound(): void {
    this.dart.inFlight = false;
    this.input.end();
    this.impact = { ...this.world.target.pos };
    this.scoring.record({ distance: Infinity, ringIndex: -1, ringScore: 0 }, this.world.target);
    this.particles.burst(this.impact, "#6b7690", 16, 300);
    this.lastResult = {
      title: "IT GOT AWAY",
      color: "#e5484d",
      points: 0,
      sub: "target hit the ground",
      newBest: false,
      hit: false,
    };
    if (this.mode === "daily") this.attemptsLeft -= 1;
    this.enterReveal([this.impact]);
  }

  debugThrow(velocity: Vec2): void {
    if (this.state === "AIMING" || this.state === "PREDICT") this.beginFlight(velocity);
  }

  private finishThrow(): void {
    const impact = this.impact!;
    if (this.mode === "predict") return this.finishPredict(impact);

    const hit = this.world.target.evaluate(impact);
    const ev = this.scoring.record(hit, this.world.target);

    if (ev.hit) {
      const color = ev.bullseye ? "#ffd166" : "#57d1ff";
      this.particles.burst(impact, color, ev.bullseye ? 42 : 26, 520);
      this.camera.addShake(ev.bullseye ? CONFIG.shake.bullseyeMag : CONFIG.shake.hitMag);
    } else {
      this.particles.burst(impact, "#6b7690", 12, 260);
    }

    this.lastResult = {
      title: ev.hit ? (ev.bullseye ? "BULLSEYE!" : "HIT!") : "MISS",
      color: ev.hit ? "#3ddc84" : "#e5484d",
      points: ev.points,
      newBest: ev.newBest,
      hit: ev.hit,
    };
    if (this.mode === "daily") this.attemptsLeft -= 1;
    this.enterReveal([impact]);
  }

  private finishPredict(impact: Vec2): void {
    const guess = this.predictGuess ?? this.world.launch;
    const err = dist(guess, impact);
    const { maxPoints, perfectDist, zeroDist } = CONFIG.modes.predict;
    const t = clamp((err - perfectDist) / (zeroDist - perfectDist), 0, 1);
    const points = Math.round(maxPoints * (1 - t));
    this.scoring.addPredict(points);

    const good = err <= perfectDist * 2;
    this.particles.burst(impact, good ? "#c08bff" : "#6b7690", good ? 30 : 12, 400);
    if (good) this.camera.addShake(CONFIG.shake.hitMag);

    this.predictRoundsLeft -= 1;
    this.lastResult = {
      title: err <= perfectDist ? "SPOT ON!" : err <= zeroDist ? "CLOSE" : "OFF",
      color: err <= perfectDist ? "#c08bff" : "#eaf2ff",
      points,
      sub: `off by ${Math.round(err)}`,
      newBest: false,
      hit: good,
    };
    this.enterReveal([impact, guess]);
  }

  private enterReveal(extra: Vec2[]): void {
    this.state = "REVEAL";
    this.stateTime = 0;
    this.timeScale = 1;
    const view = this.camera.fitView(
      [this.world.launch, this.world.target.pos, ...extra, ...this.dart.trail],
      CONFIG.camera.aimZoomPadding,
      this.world.target.outerRadius,
    );
    this.camera.animateTo(view, 0.5);
  }

  private hitBack(x: number, y: number): boolean {
    const b = this.backBtn;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  private inRect(b: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  // Handle a tap on the zoom +/- buttons; returns true if it hit one.
  private hitZoomButtons(x: number, y: number): boolean {
    if (this.inRect(this.zoomInBtn, x, y)) {
      this.zoomAt(CONFIG.camera.zoomStep, this.viewW / 2, this.viewH / 2);
      return true;
    }
    if (this.inRect(this.zoomOutBtn, x, y)) {
      this.zoomAt(1 / CONFIG.camera.zoomStep, this.viewW / 2, this.viewH / 2);
      return true;
    }
    return false;
  }

  // --- Camera zoom/pan (buttons, pinch, wheel) — routed to the active view. ---
  zoomAt(factor: number, x: number, y: number): void {
    if (this.state === "WORKSHOP") this.workshop?.zoomAt(factor, x, y);
    else if (this.state === "AIMING" || this.state === "PREDICT") {
      this.camera.zoomAt(factor, { x, y });
    }
  }

  panBy(dx: number, dy: number): void {
    if (this.state === "WORKSHOP") this.workshop?.panBy(dx, dy);
    else if (this.state === "AIMING" || this.state === "PREDICT") this.camera.panScreen(dx, dy);
  }

  // A second finger touched down: cancel any in-progress aim drag for pinch.
  onPinchStart(): void {
    this.input.end();
  }

  // Leave the current play session — back to the Workshop if we were testing a
  // draft, otherwise to the main menu.
  private exitToBack(): void {
    if (this.resumeWorkshop && this.workshop) {
      this.resumeWorkshop = false;
      this.state = "WORKSHOP";
    } else {
      this.state = "MENU";
    }
  }

  // Advance out of RESULT: next round, or game over per mode.
  private advanceRound(): void {
    if (this.resumeWorkshop) return this.exitToBack(); // testing a workshop draft
    if (this.mode === "predict") {
      if (this.predictRoundsLeft <= 0) this.enterGameOver();
      else this.startPredictRound();
    } else if (this.mode === "timeattack") {
      if (this.timeLeft <= 0) this.enterGameOver();
      else this.startThrowRound();
    } else if (this.mode === "daily") {
      if (this.attemptsLeft <= 0) this.enterGameOver();
      else this.startThrowRound();
    } else {
      this.startThrowRound(); // endless
    }
  }

  private enterGameOver(): void {
    this.state = "GAME_OVER";
    this.stateTime = 0;

    if (this.mode === "daily") {
      const passed = this.scoring.score >= this.passingScore;
      let streak = loadSave().dailyStreak;
      if (this.dailyOfficial) streak = recordDaily(this.dailyDate, passed, this.scoring.score).dailyStreak;
      this.gameOverTitle = passed ? "PASSED" : "FAILED";
      this.gameOverColor = passed ? "#3ddc84" : "#e5484d";
      this.gameOverLines = [
        `Score ${this.scoring.score} / ${this.passingScore} needed`,
        passed ? `Daily streak: ${streak}` : "Come back tomorrow",
        this.dailyOfficial ? "" : "(practice — not recorded)",
      ].filter(Boolean);
    } else if (this.mode === "timeattack") {
      this.gameOverTitle = "TIME!";
      this.gameOverColor = "#3ddc84";
      this.gameOverLines = [`Score ${this.scoring.score}`, `Best ${this.scoring.best}`];
    } else {
      this.gameOverTitle = "DONE";
      this.gameOverColor = "#c08bff";
      this.gameOverLines = [`Score ${this.scoring.score}`, `Best ${this.scoring.best}`];
    }
  }

  private desiredTimeScale(): number {
    if (this.state !== "IN_FLIGHT") return 1;
    const d = dist(this.dart.pos, this.world.target.pos);
    const trigger = CONFIG.slowmo.triggerDist;
    if (d >= trigger) return 1;
    return lerp(CONFIG.slowmo.minScale, 1, clamp(d / trigger, 0, 1));
  }

  // ----------------------------------------------------------------- Input --
  onPointerDown(x: number, y: number): void {
    switch (this.state) {
      case "MENU": {
        const id = hitTest(this.menu.buttons, x, y);
        if (id) this.startMenuChoice(id);
        break;
      }
      case "WORKSHOP":
        this.workshop?.onPointerDown(x, y);
        break;
      case "AIMING":
        if (this.hitBack(x, y)) return this.exitToBack();
        if (this.hitZoomButtons(x, y)) return;
        this.input.begin(x, y);
        break;
      case "PREDICT":
        if (this.hitBack(x, y)) return this.exitToBack();
        if (this.hitZoomButtons(x, y)) return;
        if (
          this.predictGuess &&
          x >= this.predictLock.x &&
          x <= this.predictLock.x + this.predictLock.w &&
          y >= this.predictLock.y &&
          y <= this.predictLock.y + this.predictLock.h
        ) {
          this.beginFlight(this.predictVel);
        } else {
          this.predictGuess = this.camera.screenToWorld({ x, y });
        }
        break;
      case "RESULT":
        this.advanceRound();
        break;
      case "GAME_OVER": {
        const id = hitTest(this.gameOver.buttons, x, y);
        if (id === "retry") this.startMode(this.mode);
        else if (id === "menu") this.state = "MENU";
        break;
      }
    }
  }

  onPointerMove(x: number, y: number): void {
    if (this.state === "WORKSHOP") this.workshop?.onPointerMove(x, y);
    else if (this.state === "AIMING" && this.input.active) this.input.move(x, y);
  }

  onPointerUp(x: number, y: number): void {
    if (this.state === "WORKSHOP") {
      this.workshop?.onPointerUp();
    } else if (this.state === "AIMING" && this.input.active) {
      this.input.move(x, y);
      if (this.input.power() >= 0.05) this.launchDart();
      else this.input.end();
    }
  }

  // ---------------------------------------------------------------- Update ---
  update(dt: number): void {
    if (this.state === "WORKSHOP") {
      this.workshop?.update(dt);
      return;
    }
    this.camera.update(dt);
    this.stateTime += dt;

    const desired = this.desiredTimeScale();
    this.timeScale = lerp(this.timeScale, desired, Math.min(1, CONFIG.slowmo.ramp * dt));
    const simDt = dt * this.timeScale;

    this.particles.update(simDt);

    if (this.state === "AIMING" || this.state === "IN_FLIGHT") {
      this.targetClock += simDt;
      this.world.advance(simDt, this.targetClock, this.world.level.gravity, CONFIG.physics.groundY);
    }

    // Time-attack clock runs during active play.
    if (
      this.mode === "timeattack" &&
      (this.state === "AIMING" || this.state === "IN_FLIGHT" || this.state === "RESULT")
    ) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0 && (this.state === "AIMING" || this.state === "RESULT")) {
        this.enterGameOver();
      }
    }

    if (this.state === "IN_FLIGHT") {
      const level = this.world.level;
      const env = { gravity: level.gravity, wind: level.wind };
      const prev = { ...this.dart.pos };
      integrate(this.dart, simDt, env);
      stepCollisions(this.dart, prev, level, this.collision, simDt);
      const landed = this.dart.afterMove(simDt);

      const target = this.world.target;
      const d = dist(this.dart.pos, target.pos);
      if (d < this.closestDist) {
        this.closestDist = d;
        this.closestPos = { ...this.dart.pos };
      }
      // Don't early-out on a moving target — the dart may still intercept it.
      const canEarlyOut =
        level.walls.length === 0 && level.portals.length === 0 && !target.thrown && !target.motion;
      const passedTarget = canEarlyOut && this.dart.pos.x >= target.pos.x && this.dart.vel.x >= 0;
      if (this.mode !== "predict" && d <= target.outerRadius) {
        this.dart.inFlight = false;
        this.impact = { ...this.dart.pos };
        this.finishThrow();
      } else if (passedTarget || landed) {
        this.dart.inFlight = false;
        // Missed a still-airborne thrown target -> take another shot.
        if (target.thrown && !target.landed) {
          this.rearm();
        } else {
          this.impact = { ...this.closestPos };
          this.finishThrow();
        }
      }
    } else if (this.state === "REVEAL") {
      if (!this.camera.settling && this.stateTime > 0.6) {
        this.state = "RESULT";
        this.stateTime = 0;
      }
    }

    // A thrown target that reached the ground unhit fails the round.
    if (
      (this.state === "AIMING" || this.state === "IN_FLIGHT") &&
      this.world.target.thrown &&
      this.world.target.landed
    ) {
      this.failRound();
    }
  }

  // ---------------------------------------------------------------- Render ---
  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    if (this.state === "MENU") {
      this.menu.render(ctx, this.scoring.best, loadSave().dailyStreak);
      return;
    }
    if (this.state === "WORKSHOP") {
      this.workshop?.render(ctx);
      return;
    }

    this.drawBackground(ctx);
    this.drawGround(ctx);
    this.drawWalls(ctx);
    this.drawPortals(ctx);
    this.drawTarget(ctx);
    if (this.state === "REVEAL" || this.state === "RESULT") this.drawMarkers(ctx);
    this.drawDart(ctx);
    this.particles.render(ctx, this.camera);
    if (this.state === "AIMING" && this.input.active) this.drawAimHelpers(ctx);
    if (this.state === "PREDICT") this.drawPredict(ctx);

    this.hud.render(ctx, {
      offset: this.world.targetOffset(),
      wind: this.world.level.wind,
      level: this.levelIndex,
      power: this.state === "AIMING" && this.input.active ? this.input.power() : -1,
      score: this.scoring.score,
      best: this.scoring.best,
      combo: this.scoring.combo,
      status: this.statusLine(),
      message:
        this.state === "AIMING"
          ? this.world.target.thrown
            ? "Hit the falling target before it lands!"
            : "Drag anywhere to aim · release to throw"
          : undefined,
    });

    if (this.state === "AIMING" || this.state === "PREDICT") {
      this.drawBackButton(ctx);
      this.drawZoomButtons(ctx);
    }
    if (this.state === "RESULT" || this.state === "REVEAL") this.drawResult(ctx);
    if (this.state === "GAME_OVER") {
      this.gameOver.render(ctx, this.gameOverTitle, this.gameOverLines, this.gameOverColor);
    }
  }

  private drawZoomButtons(ctx: CanvasRenderingContext2D): void {
    const draw = (b: { x: number; y: number; w: number; h: number }, sym: string) => {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 9);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#eaf2ff";
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sym, b.x + b.w / 2, b.y + b.h / 2 - 1);
    };
    draw(this.zoomInBtn, "+");
    draw(this.zoomOutBtn, "−");
  }

  private drawBackButton(ctx: CanvasRenderingContext2D): void {
    const b = this.backBtn;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("‹", b.x + b.w / 2, b.y + b.h / 2 - 1);
  }

  private statusLine(): string | undefined {
    if (this.mode === "timeattack") {
      const s = Math.ceil(this.timeLeft);
      return `TIME ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    if (this.mode === "daily") {
      return `TRY ${this.attemptsLeft}/${CONFIG.modes.dailyAttempts} · PASS ${this.passingScore}`;
    }
    if (this.mode === "predict") {
      return `PREDICT · ${this.predictRoundsLeft} left`;
    }
    return undefined;
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#161d33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  // Visible ground plane at world y = groundY, drawn across every play mode.
  private drawGround(ctx: CanvasRenderingContext2D): void {
    const top = this.camera.worldToScreen({ x: this.camera.center.x, y: CONFIG.physics.groundY }).y;
    if (top >= this.viewH) return; // ground entirely below the viewport
    const y = Math.max(0, top);
    const g = ctx.createLinearGradient(0, y, 0, this.viewH);
    g.addColorStop(0, "#2f3d26");
    g.addColorStop(1, "#18220f");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, this.viewW, this.viewH - y);
    if (top >= 0) {
      ctx.strokeStyle = "#5a8a3c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(this.viewW, top);
      ctx.stroke();
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D): void {
    for (const w of this.world.level.walls) {
      const a = this.camera.worldToScreen(w.a);
      const b = this.camera.worldToScreen(w.b);
      const warm = Math.round(120 + w.restitution * 120);
      ctx.strokeStyle = `rgb(${warm}, ${180 - w.restitution * 60}, 120)`;
      ctx.lineWidth = Math.max(3, 10 * this.camera.scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  private drawPortals(ctx: CanvasRenderingContext2D): void {
    const drawGate = (pos: Vec2, r: number, color: string) => {
      const s = this.camera.worldToScreen(pos);
      const rad = r * this.camera.scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, 4 * this.camera.scale);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color.replace(")", ", 0.15)").replace("rgb", "rgba");
      ctx.beginPath();
      ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const p of this.world.level.portals) {
      drawGate(p.a.pos, p.radius, "rgb(120, 90, 255)");
      drawGate(p.b.pos, p.radius, "rgb(255, 140, 60)");
    }
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
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(2, 8 * this.camera.scale), 0, Math.PI * 2);
    ctx.fillStyle = "#0b1020";
    ctx.fill();
  }

  // A labelled crosshair at the player's predicted landing spot.
  private drawGuessMarker(ctx: CanvasRenderingContext2D, label: boolean): void {
    if (!this.predictGuess) return;
    const g = this.camera.worldToScreen(this.predictGuess);
    ctx.strokeStyle = "#c08bff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 13, 0, Math.PI * 2);
    ctx.moveTo(g.x - 18, g.y);
    ctx.lineTo(g.x + 18, g.y);
    ctx.moveTo(g.x, g.y - 18);
    ctx.lineTo(g.x, g.y + 18);
    ctx.stroke();
    if (label) {
      ctx.fillStyle = "#c08bff";
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("your guess", g.x, g.y - 22);
    }
  }

  // Guess marker (predict) and actual-landing marker during the reveal.
  private drawMarkers(ctx: CanvasRenderingContext2D): void {
    if (this.mode === "predict") this.drawGuessMarker(ctx, false);
    if (this.impact) {
      const p = this.camera.worldToScreen(this.impact);
      ctx.fillStyle = "#eaf2ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDart(ctx: CanvasRenderingContext2D): void {
    const p = this.camera.worldToScreen(this.dart.pos);
    let angle: number;
    if (this.state === "AIMING") {
      const dir = this.input.active ? this.input.launchDir() : { x: 0.7, y: 0.7 };
      angle = Math.atan2(-dir.y, dir.x);
    } else if (this.state === "PREDICT") {
      angle = Math.atan2(-this.predictVel.y, this.predictVel.x);
    } else {
      const h = this.dart.heading;
      angle = Math.atan2(-Math.sin(h), Math.cos(h));
    }

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
    ctx.strokeStyle = "#eaf2ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-L * 0.6, 0);
    ctx.lineTo(L * 0.4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L * 0.4, 0);
    ctx.lineTo(L * 0.4 - 8, -5);
    ctx.lineTo(L * 0.4 - 8, 5);
    ctx.closePath();
    ctx.fillStyle = "#57d1ff";
    ctx.fill();
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

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(launch.x, launch.y);
    ctx.lineTo(launch.x + drag.x, launch.y + drag.y);
    ctx.stroke();
    ctx.setLineDash([]);

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

  private drawPredict(ctx: CanvasRenderingContext2D): void {
    // Show the player's current guess as they place/adjust it.
    this.drawGuessMarker(ctx, true);

    // Show the fixed power/angle the player must forecast.
    const speed = Math.hypot(this.predictVel.x, this.predictVel.y);
    const power = Math.round((speed / CONFIG.physics.maxSpeed) * 100);
    const angle = Math.round((Math.atan2(this.predictVel.y, this.predictVel.x) * 180) / Math.PI);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#c08bff";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText(`Power ${power}%  ·  Angle ${angle}°`, this.viewW / 2, 100);
    ctx.fillStyle = "rgba(234,242,255,0.75)";
    ctx.font = "500 14px system-ui, sans-serif";
    ctx.fillText(
      this.predictGuess ? "Tap to adjust · LOCK IN to throw" : "Tap where you think it lands",
      this.viewW / 2,
      124,
    );

    // Lock-in button (only once a guess exists).
    if (this.predictGuess) {
      const w = 160;
      const h = 50;
      this.predictLock = { x: (this.viewW - w) / 2, y: this.viewH - 84, w, h };
      const b = this.predictLock;
      ctx.fillStyle = "rgba(192,139,255,0.18)";
      ctx.strokeStyle = "#c08bff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#eaf2ff";
      ctx.font = "700 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LOCK IN", b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  private drawResult(ctx: CanvasRenderingContext2D): void {
    const r = this.lastResult;
    if (!r) return;

    if (this.state === "RESULT") {
      ctx.fillStyle = "rgba(6,10,20,0.5)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    const cx = this.viewW / 2;
    const cy = this.viewH * 0.38;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = r.color;
    ctx.font = "800 42px system-ui, sans-serif";
    ctx.fillText(r.title, cx, cy);

    ctx.fillStyle = "#eaf2ff";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(r.points > 0 ? `+${r.points}` : r.hit ? "+0" : "no points", cx, cy + 40);

    if (r.sub) {
      ctx.fillStyle = "rgba(234,242,255,0.7)";
      ctx.font = "500 15px system-ui, sans-serif";
      ctx.fillText(r.sub, cx, cy + 64);
    }

    if (r.newBest && r.points > 0) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillText("★ NEW BEST ★", cx, cy + 88);
    }

    if (this.state === "RESULT") {
      ctx.fillStyle = "rgba(234,242,255,0.8)";
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillText("Tap to continue", cx, cy + 120);
    }
  }
}
