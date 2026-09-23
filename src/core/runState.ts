import { isRosterSpellId, type RosterSpellId } from '../config/loadout';
import type { SpellId } from '../config/spells';
import { BOSS_START_TIME } from '../config/waves';
import { NO_HIT_STOP, requestHitStop, spendHitStop, type HitStopState } from './hitFeedback';
import { emitRunEvent, type RunEventEmitter, type RunPhase } from './runEvents';
import type { RunStats } from './scenePayloads';
import { applyXpGain, xpToNext } from './xp';

/**
 * The run itself (spec §4 step 2, §5): the clock, the phase it drives, and the
 * tallies the HUD and the result screen read — kills, level, xp, perks taken,
 * and the Embers, consumables and relics picked up (#195).
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

/** The boss phase starts at 20:00 (#127). Milliseconds, since the clock is in ms. */
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
  private embersValue = 0;
  private consumableCount = 0;
  private relicCount = 0;
  private freeze: HitStopState = NO_HIT_STOP;

  /**
   * `timeScale` multiplies every frame delta (spec §8's smoke tests run at 10).
   * It is read from the URL by `resolveTimeScale`, and clamped here too so no
   * caller can hand the run a clock that never advances.
   *
   * `startMs` starts the clock late (`?startAt=`, #127): a test hook, so the
   * run is otherwise a fresh one. Anything unusable is a run from 0:00.
   */
  constructor(emitter: Pick<RunEventEmitter, 'emit'>, timeScale = 1, startMs = 0) {
    this.emitter = emitter;
    this.timeScale = clampTimeScale(timeScale);
    this.elapsed = Number.isFinite(startMs) && startMs > 0 ? startMs : 0;
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

  /** Embers collected this run (#195). */
  get embers(): number {
    return this.embersValue;
  }

  /** Consumables and relics picked up this run (#195). */
  get consumables(): number {
    return this.consumableCount;
  }

  get relics(): number {
    return this.relicCount;
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
   *
   * A hit-stop owed (`hitStop`) is taken from the front of the window: that
   * much of the frame is frozen — the clock holds, and the window is shorter
   * by it — and the rest moves. A fully frozen frame is a zero-length window
   * that still publishes the timer, so the HUD holds with the arena.
   */
  tick(deltaMs: number): RunFrame {
    const startMs = this.elapsed;
    if (this.current === 'over' || !(deltaMs > 0) || !Number.isFinite(deltaMs)) {
      return { startMs, deltaMs: 0 };
    }

    const spent = spendHitStop(this.freeze, deltaMs * this.timeScale);
    this.freeze = spent.state;
    const scaled = deltaMs * this.timeScale - spent.frozenMs;
    this.elapsed = startMs + scaled;
    emitRunEvent(this.emitter, 'timer', { elapsedMs: this.elapsed });
    // Timer first, then the phase it crossed into: a listener that redraws on
    // either event already has the clock that explains the new phase.
    if (this.current === 'waves' && this.elapsed >= BOSS_START_MS) this.setPhase('boss');
    return { startMs, deltaMs: scaled };
  }

  /**
   * #125: freeze the arena for `ms` of run time from the next frame on. The
   * freeze is in run time, not wall time, so a scaled run freezes for the same
   * share of itself as a real-time one; requests never add up, and they are
   * paid from a budget that caps how much of a run is ever frozen
   * (`core/hitFeedback.ts`). Nothing the arena decides reads the freeze — it
   * only delays when the next steps run.
   */
  hitStop(ms: number): void {
    if (this.current === 'over') return;
    this.freeze = requestHitStop(this.freeze, ms);
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

  /**
   * Embers collected (#195): an Ember pickup's worth, a boss kill's pay, or a
   * drop the full pool could not place. Published as the new total.
   */
  addEmbers(amount: number): void {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    this.embersValue += amount;
    emitRunEvent(this.emitter, 'embers', { embers: this.embersValue });
  }

  /** A consumable picked up (#195); returns the run's total. */
  recordConsumable(): number {
    this.consumableCount += 1;
    return this.consumableCount;
  }

  /** A relic picked up (#195); returns the run's total. */
  recordRelic(): number {
    this.relicCount += 1;
    return this.relicCount;
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
      embers: this.embersValue,
      consumables: this.consumableCount,
      relics: this.relicCount,
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
 * `?startAt=<seconds>` starts the run clock late (#127): a 20-minute run is too
 * long for a Playwright check to climb, so the full run starts just short of
 * the boss. A test hook like `?timeScale=`; the build is still a fresh one.
 * Returns ms. Anything absent, unparseable, negative or not before the boss
 * reads as 0.
 */
export function resolveStartAt(search: string): number {
  const raw = new URLSearchParams(search).get('startAt');
  if (raw === null || raw.trim() === '') return 0;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= BOSS_START_TIME) return 0;
  return seconds * 1000;
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
 * `?loadout=fire,ice,fire_companion` equips those spells alongside the one
 * picked on the select screen (CO-109). A test hook like `?timeScale=`: it puts
 * a chosen set of actives on the board without playing up to the levels that
 * unlock the slots, and it ignores the element a spell belongs to, so one run
 * can exercise spells a real loadout would never carry together.
 *
 * Any roster id is accepted, not only the Phase 1 four (#133): an id this build
 * has no implementation for is refused later by `Spellbook.equip`, which is
 * where the one rule about it belongs. Ids are returned in the order they were
 * written; unknown ids are dropped, and the chosen spell repeating here is
 * harmless (`Spellbook.equip` refuses a second copy of anything equipped).
 */
export function resolveLoadout(search: string): RosterSpellId[] {
  const raw = new URLSearchParams(search).get('loadout');
  if (raw === null) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(isRosterSpellId);
}
