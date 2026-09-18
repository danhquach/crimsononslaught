import { isSpellId, type SpellId } from '../config/spells';
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
 * The fastest `?timeScale=` a run may be driven at; anything higher is clamped
 * to it.
 *
 * The arena is simulated in steps of about `SIM_STEP_MS` whatever the scale
 * (`simulationSteps`), so a scaled run is a real one fast-forwarded and plays
 * the same. What the scale costs is CPU: every frame owes `scale` times as
 * many steps as a real-time one, and a machine that cannot run them within the
 * frame renders fewer frames, each owing more. 30 is what the Playwright full
 * run drives, and on the slowest runner it has to fit the boss fight into the
 * check's 90 s.
 */
export const MAX_TIME_SCALE = 30;

/**
 * Any value to a usable run-clock multiplier. Zero, negative, non-finite and
 * non-numeric all read as real time, so no caller can hand the run a clock
 * that never advances or a frame that never ends.
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

/** One 60 fps frame of run time: what a single simulation step covers, give or take. */
export const SIM_STEP_MS = 1000 / 60;

/**
 * Cut a frame into the steps the arena is simulated in: equal, contiguous
 * windows of about `SIM_STEP_MS` each, as many as the frame needs.
 *
 * A step is one decision — one steering vector per enemy, one angle for
 * Earth's ring, one physics integration — and one that covers seconds of run
 * time stops tracking the arena: the boss's chase overshoots the player by
 * hundreds of px and Earth's 80 px ring never touches it (#89), and the slower
 * the machine renders, the longer each frame's decision gets (#94: CI at ~10
 * fps and scale 30 decided once per 3 s of run time and never killed the boss).
 * Stepping the frame keeps every decision as fine as a real-time frame's, so a
 * scaled run plays the same as a real one, only faster.
 *
 * The count is rounded rather than ceiled so a real-time frame's jitter (17 ms,
 * 24 ms) stays one step, as it always was; the longest step is thus one and a
 * half `SIM_STEP_MS`. A zero-length frame is no steps.
 */
export function simulationSteps(frame: RunFrame): RunFrame[] {
  if (!(frame.deltaMs > 0)) return [];
  const count = Math.max(1, Math.round(frame.deltaMs / SIM_STEP_MS));
  const deltaMs = frame.deltaMs / count;
  return Array.from({ length: count }, (_, i) => ({
    startMs: frame.startMs + i * deltaMs,
    deltaMs,
  }));
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

  /**
   * Display names of the upgrades taken, in pick order — a passive's name each
   * time a rank of it is picked, and a spell's when it is equipped. A copy: the
   * run owns the list.
   */
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

  /** One level-up pick, by display name (a passive rank or a newly equipped spell). */
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

/**
 * `?loadout=fire,ice,lightning` equips those spells alongside the one picked on
 * the select screen (CO-109). A test hook like `?timeScale=`: a run cannot yet
 * be offered a second active — that is #132's level-up rework — and until then
 * this is the only way to drive several at once.
 *
 * Ids are returned in the order they were written; unknown ids are dropped, and
 * the chosen spell repeating here is harmless (`Spellbook.equip` refuses a
 * second copy of anything already equipped).
 */
export function resolveLoadout(search: string): SpellId[] {
  const raw = new URLSearchParams(search).get('loadout');
  if (raw === null) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(isSpellId);
}
