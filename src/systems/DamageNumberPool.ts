import Phaser from 'phaser';
import { NUMBER_DEPTH } from '../config/fx';
import { MAX_LIVE_NUMBERS, type NumberStyle } from '../config/hitFeedback';
import {
  addDot,
  ageDot,
  numberPose,
  numberSpread,
  numberStyle,
  numberText,
  shownDamage,
  type DotTally,
  type HitKind,
} from '../core/hitFeedback';
import type { Enemy } from '../entities/Enemy';

interface LiveNumber {
  readonly text: Phaser.GameObjects.Text;
  readonly style: NumberStyle;
  readonly x: number;
  readonly y: number;
  ageMs: number;
}

/** An enemy's burn and bleed owed to a number, and where it last stood to print it. */
interface PendingDot {
  tally: DotTally;
  x: number;
  y: number;
}

/**
 * Damage numbers (#125): a pool of text objects rising off the enemies they
 * hit. `show` takes one and `update` moves them all on the run clock, so they
 * freeze with a paused Game or a hit-stop and speed up with `?timeScale=`. Past
 * `MAX_LIVE_NUMBERS` a number is dropped, never queued, the rule every pool
 * follows.
 *
 * Burn and bleed land as a sliver every step; `addDot` sums them per enemy and
 * `update` prints the sum once it is due (`core/hitFeedback.ts`), or `flushDot`
 * at once when the enemy dies.
 *
 * Presentation only: nothing here is read back by the run.
 */
export class DamageNumberPool {
  private readonly scene: Phaser.Scene;
  private readonly idle: Phaser.GameObjects.Text[] = [];
  private readonly live: LiveNumber[] = [];
  private readonly dots = new Map<Enemy, PendingDot>();
  /** Every number made so far, what `numberSpread` spreads them by. */
  private made = 0;
  private created = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Numbers on screen right now; never more than `MAX_LIVE_NUMBERS`. */
  get count(): number {
    return this.live.length;
  }

  /** Print `amount` rising from (x, y). Returns whether it was shown. */
  show(x: number, y: number, amount: number, kind: HitKind, crit: boolean): boolean {
    if (shownDamage(amount) === 0) return false;
    const text = this.take();
    if (!text) return false;
    const style = numberStyle(amount, kind, crit);
    const at = { x: x + numberSpread(this.made), y };
    this.made += 1;
    // One redraw: the style is set without one, the text change makes it.
    text.style.setStyle(
      { fontSize: `${style.size}px`, color: style.color, fontStyle: crit ? 'bold' : 'normal' },
      false,
    );
    text.setText(numberText(amount, crit)).setPosition(at.x, at.y).setAlpha(1).setVisible(true);
    this.live.push({ text, style, x: at.x, y: at.y, ageMs: 0 });
    return true;
  }

  /** A burn or bleed sliver on `enemy`, held until its number is due. */
  addDot(enemy: Enemy, amount: number): void {
    const pending = this.dots.get(enemy);
    this.dots.set(enemy, { tally: addDot(pending?.tally, amount), x: enemy.x, y: enemy.y });
  }

  /** Print what `enemy` still owes at once: it has just died. */
  flushDot(enemy: Enemy): void {
    const pending = this.dots.get(enemy);
    if (!pending) return;
    this.dots.delete(enemy);
    this.show(pending.x, pending.y, pending.tally.amount, 'dot', false);
  }

  update(deltaMs: number): void {
    for (const [enemy, pending] of this.dots) {
      const aged = ageDot(pending.tally, deltaMs);
      if (aged.due > 0) {
        this.dots.delete(enemy);
        this.show(pending.x, pending.y, aged.due, 'dot', false);
      } else pending.tally = aged.tally;
    }
    // Compacted in place: a finished number goes back to the idle list.
    let kept = 0;
    for (const number of this.live) {
      number.ageMs += deltaMs;
      const pose = numberPose(number.style, number.ageMs);
      if (pose.done) {
        number.text.setVisible(false);
        this.idle.push(number.text);
        continue;
      }
      number.text.setPosition(number.x, number.y + pose.dy).setAlpha(pose.alpha);
      this.live[kept] = number;
      kept += 1;
    }
    this.live.length = kept;
  }

  /** A free text object, made on first need up to the cap; null past it. */
  private take(): Phaser.GameObjects.Text | null {
    const text = this.idle.pop();
    if (text) return text;
    if (this.created >= MAX_LIVE_NUMBERS) return null;
    this.created += 1;
    return this.scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(NUMBER_DEPTH);
  }
}
