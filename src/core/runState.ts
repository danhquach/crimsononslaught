import type { SpellId } from '../config/spells';
import { BOSS_START_TIME } from '../config/waves';
import { emitRunEvent, type RunEventEmitter, type RunPhase } from './runEvents';
import type { RunStats } from './scenePayloads';
import { applyXpGain, xpToNext } from './xp';

/**
 * The run itself (spec §4 step 2, §5): the clock, the phase it drives, and the
 * tallies the HUD and the result screen read — kills, level, xp, perks taken.
 *
 * Every change is published on the Game scene's emitter through the `run:*`
 * contract in `core/runEvents.ts`, so nothing polls this object. The two
 * channels RunState does *not* own are the ones whose source is an entity:
 * `hp` comes from `Player` (CO-021) and `bossHp` will come from `Boss`
 * (CO-050); both emit through the same contract.
 *
 * Pure TS, no Phaser import — `Phaser.Events.EventEmitter` satisfies
 * `RunEventEmitter` structurally, and the tests drive it with a fake.
 */

/** Spec §5: the boss phase starts at 5:00. Milliseconds, since the clock is in ms. */
export const BOSS_START_MS = BOSS_START_TIME * 1000;

/**
 * `?timeScale=` is a test hook; this ceiling keeps a typo from freezing the tab.
 *
 * It is a safety limit, not a usable speed: the scale multiplies one frame's
 * delta, so how much run time a single frame simulates depends on the machine.
 * Near the ceiling a slow machine's frames cover seconds of run time each, and
 * a projectile's step carries it past its target rather than into it while the
 * cast backlog is dropped at `MAX_CASTS_PER_FRAME` — the clock flies and almost
 * nothing lands (CO-091). Around 30 and below the arena stays faithful on a
 * slow runner, which is what the Playwright suites drive.
 */
export const MAX_TIME_SCALE = 100;

/**
 * Any value to a usable run-clock multiplier. Zero, negative, non-finite and
 * non-numeric all read as real time: the scale divides into Arcade's step
 * budget in `GameScene`, where an `Infinity` would stop the physics world
 * silently rather than throw.
 */
export function clampTimeScale(value: unknown, fallback = 1): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_TIME_SCALE);
}

/** What one frame of the run covers. `startMs` is the clock before the frame. */
export interface RunFrame {
  /** Start of the frame's half-open window `[startMs, startMs + deltaMs)`. */
  startMs: number;
  /** Scaled length of the frame in ms; 0 once the run is over. */
  deltaMs: number;
}

export class RunState {
  private readonly emitter: Pick<RunEventEmitter, 'emit'>;
  /** Multiplies every frame delta; see the constructor. */
  private readonly timeScale: number;
  private elapsed = 0;
  private current: RunPhase = 'waves';
  private killCount = 0;
  private levelValue = 1;
  private xpValue = 0;
  private readonly perksTaken: string[] = [];

  /**
   * `timeScale` multiplies every frame delta (spec §8's smoke tests run at 10).
   * It is read from the URL by `resolveTimeScale`, and clamped here too so no
   * caller can hand the run a clock that never advances.
   */
  constructor(emitter: Pick<RunEventEmitter, 'emit'>, timeScale = 1) {
    this.emitter = emitter;
    this.timeScale = clampTimeScale(timeScale);
  }

  get elapsedMs(): number {
    return this.elapsed;
  }

  get phase(): RunPhase {
    return this.current;
  }

  get kills(): number {
    return this.killCount;
  }

  get level(): number {
    return this.levelValue;
  }

  get xp(): number {
    return this.xpValue;
  }

  /** XP still needed to leave the current level (spec §5's curve, `core/xp.ts`). */
  get xpToNext(): number {
    return xpToNext(this.levelValue);
  }

  /** Display names of the perks taken, in pick order. A copy: the run owns the list. */
  get perks(): readonly string[] {
    return [...this.perksTaken];
  }

  /**
   * Advance the clock by one frame and publish it. Returns the window the rest
   * of the frame should simulate, so the time scale reaches the spawn director
   * and the entities too rather than only the HUD timer.
   *
   * A finished run returns a zero-length window: Game keeps rendering the last
   * frame, but nothing moves and no event fires.
   */
  tick(deltaMs: number): RunFrame {
    const startMs = this.elapsed;
    if (this.current === 'over' || !(deltaMs > 0) || !Number.isFinite(deltaMs)) {
      return { startMs, deltaMs: 0 };
    }

    const scaled = deltaMs * this.timeScale;
    this.elapsed = startMs + scaled;
    emitRunEvent(this.emitter, 'timer', { elapsedMs: this.elapsed });
    // Timer first, then the phase it crossed into: a listener that redraws on
    // either event already has the clock that explains the new phase.
    if (this.current === 'waves' && this.elapsed >= BOSS_START_MS) this.setPhase('boss');
    return { startMs, deltaMs: scaled };
  }

  /** End of the run (spec §4 step 4): the clock stops and the phase is final. */
  end(): void {
    if (this.current === 'over') return;
    this.setPhase('over');
  }

  recordKill(): void {
    this.killCount += 1;
    emitRunEvent(this.emitter, 'kill', { kills: this.killCount });
  }

  /**
   * Collected XP (spec §5: a gem is 1 XP), applied to the curve. Returns how
   * many levels it crossed — one pickup can cross several, and the caller owes
   * the player that many level-up offers, in order (spec §4 step 3).
   *
   * The whole gain is one `xp` event: every payload is absolute, so the HUD
   * needs the settled level and progress, not the steps between.
   */
  addXp(amount: number): number {
    // Nothing collected: no state change, no event.
    if (!(amount > 0) || !Number.isFinite(amount)) return 0;
    const gain = applyXpGain({ level: this.levelValue, xp: this.xpValue }, amount);
    this.levelValue = gain.level;
    this.xpValue = gain.xp;
    this.emitXp();
    return gain.levelsGained;
  }

  recordPerk(displayName: string): void {
    this.perksTaken.push(displayName);
  }

  /** The summary the result screen renders (`core/resultModel.ts`). */
  stats(spellId: SpellId): RunStats {
    return {
      timeSurvivedMs: this.elapsed,
      level: this.levelValue,
      kills: this.killCount,
      spellId,
      perks: this.perks,
    };
  }

  private setPhase(phase: RunPhase): void {
    this.current = phase;
    emitRunEvent(this.emitter, 'phase', { phase });
  }

  /** Progress inside the current level, plus the threshold the HUD bar fills toward. */
  private emitXp(): void {
    emitRunEvent(this.emitter, 'xp', {
      xp: this.xpValue,
      xpToNext: this.xpToNext,
      level: this.levelValue,
    });
  }
}

/**
 * `?timeScale=<positive number>` multiplies the run clock — the hook the
 * Playwright smoke runs use to reach the boss in seconds (spec §8). It is read
 * in the built app as well as in dev, because those runs and the acceptance
 * pass (CO-063) drive the deployed build; anything absent, unparseable or
 * non-positive falls back to real time.
 */
export function resolveTimeScale(search: string, fallback = 1): number {
  const raw = new URLSearchParams(search).get('timeScale');
  if (raw === null || raw.trim() === '') return fallback;
  return clampTimeScale(Number(raw), fallback);
}

/**
 * `?invulnerable=1` makes the player ignore contact damage. A test hook like
 * `?timeScale=`: the hands-off Playwright full run (spec §8, CO-061) needs the
 * player to reach the boss without anyone steering. Only the exact value `1`
 * turns it on, so a stray param never silently blesses a run.
 */
export function resolveInvulnerable(search: string): boolean {
  return new URLSearchParams(search).get('invulnerable') === '1';
}
