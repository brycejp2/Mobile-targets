// Slingshot drag control. The player drags anywhere on screen; drag *length*
// sets power and drag *direction* sets the launch angle (aim is opposite the
// pull). Works with the flipped screen-y convention: pulling down/left launches
// up/right.

import { CONFIG } from "../config";
import { clamp, len, normalize, Vec2 } from "../util/math";

export class InputController {
  active = false;
  private start: Vec2 = { x: 0, y: 0 };
  private cur: Vec2 = { x: 0, y: 0 };

  begin(x: number, y: number): void {
    this.active = true;
    this.start = { x, y };
    this.cur = { x, y };
  }

  move(x: number, y: number): void {
    if (this.active) this.cur = { x, y };
  }

  end(): void {
    this.active = false;
  }

  // Raw drag vector in screen pixels (from press to current).
  dragScreen(): Vec2 {
    return { x: this.cur.x - this.start.x, y: this.cur.y - this.start.y };
  }

  power(): number {
    return clamp(len(this.dragScreen()) / CONFIG.physics.maxPullPx, 0, 1);
  }

  // Unit launch direction in WORLD space (+y up). Opposite the drag, with the
  // y axis flipped because screen-y grows downward.
  launchDir(): Vec2 {
    const d = this.dragScreen();
    return normalize({ x: -d.x, y: d.y });
  }

  // Full launch velocity in world units/s.
  launchVelocity(): Vec2 {
    const p = this.power();
    const dir = this.launchDir();
    const speed = p * CONFIG.physics.maxSpeed;
    return { x: dir.x * speed, y: dir.y * speed };
  }

  get startScreen(): Vec2 {
    return this.start;
  }
  get curScreen(): Vec2 {
    return this.cur;
  }
}
