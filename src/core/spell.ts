import type { Vec2 } from './input';
import type { SpellStatsBySpell, StattedSpellId } from './spellStats';

/**
 * What every spell is made of (spec §5 "Spells"): a stat block, a clock that
 * decides when it goes off, and a way to find something to aim at.
 *
 * The four spells (CO-044..047) differ only in what a cast *does*, so that is
 * the one thing `Spell` leaves abstract. Everything around it — counting down
 * the cooldown across scaled frames, surviving a passive that shortens that
 * cooldown mid-run, picking the nearest targets — lives here once and is
 * unit-tested against a stub instead of four times against Phaser.
 *
 * Pure TS, no Phaser import: a subclass brings the sprites, this file only
 * counts time and distances.
 */

/**
 * How many casts one frame may pay out (spec §5: spells fire on a cooldown, not
 * in bursts). A frame long enough to owe more than this is a stall — an alt-tab,
 * a breakpoint — and firing the whole backlog into the arena at once is worse
 * than dropping it, so the surplus is discarded rather than queued.
 */
export const MAX_CASTS_PER_FRAME = 4;

/**
 * The cooldown clock, in seconds of run time.
 *
 * `due` is handed the current cooldown every frame rather than at construction,
 * because Haste shortens it mid-run and the next cast has to feel it.
 * Time left over after a cast carries into the following frame, so a cast lands
 * every `cooldown` s of run time whatever the frame length — the property the
 * `?timeScale=` smoke runs depend on (spec §8).
 */
export class CastScheduler {
  private charge = 0;

  /**
   * Advance by `deltaS` seconds and return how many casts are owed now.
   *
   * The first cast lands one full `cooldown` after the run starts, not on the
   * frame the spell is created: a spell is a repeating timer, and starting it
   * with a free cast would make its first interval the odd one out.
   */
  due(deltaS: number, cooldown: number): number {
    if (deltaS > 0 && Number.isFinite(deltaS)) this.charge += deltaS;
    // A non-positive or missing cooldown would pay out forever; such a config
    // is caught at boot (spec §7), and here it simply never fires.
    if (!(cooldown > 0) || !Number.isFinite(cooldown)) return 0;
    if (this.charge < cooldown) return 0;

    const owed = Math.floor(this.charge / cooldown);
    if (owed > MAX_CASTS_PER_FRAME) {
      // Drop the backlog with the remainder it would have carried, so a stalled
      // frame costs casts but never leaves the clock permanently behind.
      this.charge = this.charge % cooldown;
      return MAX_CASTS_PER_FRAME;
    }
    this.charge -= owed * cooldown;
    return owed;
  }

  /** Seconds of charge held over from the last frame. */
  get pending(): number {
    return this.charge;
  }

  /**
   * Stay ready: charge pinned at one full `cooldown`, so the next frame pays out
   * exactly one cast. For a cast that came due with nothing to aim at (#212) —
   * the wait is not a backlog, and it must not become a burst later.
   */
  holdReady(cooldown: number): void {
    this.charge = cooldown;
  }

  /** Back to a full cooldown from now — for a spell that stops and restarts. */
  reset(): void {
    this.charge = 0;
  }
}

/**
 * The `count` candidates closest to `origin`, nearest first.
 *
 * Distance is measured to each candidate's position; `maxRange` (a spell's
 * `range` / `chainRange` / pulse `radius`) drops anything further out, and its
 * own distance counts as in range so a stat reads as the reach it says.
 * Equally distant candidates keep their input order, which keeps a cast
 * reproducible from a seed without the targeting itself drawing from the RNG.
 */
export function nearestEnemies<T extends Vec2>(
  origin: Readonly<Vec2>,
  candidates: readonly T[],
  count: number,
  maxRange = Infinity,
): T[] {
  if (!(count > 0)) return [];
  const inRange: { target: T; distSq: number }[] = [];
  const rangeSq = maxRange === Infinity ? Infinity : maxRange * maxRange;
  for (const target of candidates) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= rangeSq) inRange.push({ target, distSq });
  }
  // Index order is the tie-break: `sort` is stable, so equal distances come out
  // in the order the caller listed them.
  inRange.sort((a, b) => a.distSq - b.distSq);
  return inRange.slice(0, Math.floor(count)).map((entry) => entry.target);
}

/**
 * Whether any candidate stands within `range` of `origin`, the range itself
 * counting as in — `nearestEnemies`' rule, without sorting a crowd to learn it.
 */
export function anyWithin(
  origin: Readonly<Vec2>,
  candidates: readonly Readonly<Vec2>[],
  range: number,
): boolean {
  const rangeSq = range * range;
  for (const target of candidates) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    if (dx * dx + dy * dy <= rangeSq) return true;
  }
  return false;
}

/**
 * One run's spell. `update` is driven from `GameScene` with the frame window
 * `RunState.tick` returns, so a scaled run (`?timeScale=`) scales the spell too.
 *
 * A subclass implements `cast()` — one volley, pulse, or bolt — and, if it is
 * not a cooldown spell (Earth's boulders orbit continuously), overrides
 * `tick(deltaS)` instead of letting the scheduler drive it.
 */
export abstract class Spell<S extends StattedSpellId = StattedSpellId> {
  readonly id: S;
  /**
   * Told after every cast the scheduler pays out (CO-102: the cast cue). A
   * listener, not a participant: it runs after `cast()` and returns nothing, so
   * it cannot change what the cast did or when the next one lands.
   */
  onCast: (() => void) | null = null;
  private currentStats: SpellStatsBySpell[S];
  private readonly scheduler = new CastScheduler();

  constructor(id: S, stats: SpellStatsBySpell[S]) {
    this.id = id;
    // Copied so the caller's block — the `Spellbook`'s resolved stats — and the
    // spell's can never be changed through each other.
    this.currentStats = { ...stats };
  }

  /** The live block. Read it per cast: a passive can change it between two casts. */
  get stats(): Readonly<SpellStatsBySpell[S]> {
    return this.currentStats;
  }

  /** Seconds until the next cast, or `Infinity` for a spell that never fires. */
  get timeToNextCast(): number {
    const cooldown = this.cooldown;
    if (!(cooldown > 0) || !Number.isFinite(cooldown)) return Infinity;
    return Math.max(0, cooldown - this.scheduler.pending);
  }

  /**
   * How far the current cooldown has run, in [0, 1], for the HUD (#144). `null`
   * for a spell that never waits on one — an orbit or a shield is simply out.
   */
  get castProgress(): number | null {
    const cooldown = this.cooldown;
    if (!(cooldown > 0) || !Number.isFinite(cooldown)) return null;
    return Math.min(1, Math.max(0, this.scheduler.pending / cooldown));
  }

  /**
   * One frame, in milliseconds of run time — the same unit `RunState.tick`
   * returns and the pools are stepped with.
   */
  update(deltaMs: number): void {
    this.tick(deltaMs / 1000);
  }

  /** Overwrite the block wholesale, as the `Spellbook` resolved it. */
  setStats(stats: SpellStatsBySpell[S]): void {
    this.currentStats = { ...stats };
  }

  /**
   * The frame, in seconds. The default drives `cast()` off the cooldown; a
   * spell without one overrides this and never sees the scheduler.
   *
   * A cast that comes due with nothing in range is held, not spent (#212): no
   * cast, no cue, and the spell stays ready until the first frame a target
   * steps into range.
   */
  protected tick(deltaS: number): void {
    const casts = this.scheduler.due(deltaS, this.cooldown);
    for (let i = 0; i < casts; i += 1) {
      if (!this.hasTarget()) {
        this.scheduler.holdReady(this.cooldown);
        return;
      }
      this.cast();
      this.onCast?.();
    }
  }

  /**
   * Seconds between casts. Read fresh every frame so a passive shortens
   * the wait the player is already in. `Infinity` for a spell with no cooldown.
   */
  protected get cooldown(): number {
    const cooldown = (this.currentStats as { cooldown?: number }).cooldown;
    return cooldown === undefined ? Infinity : cooldown;
  }

  /**
   * Whether a cast now would have something to aim at. The default, for a spell
   * with no targeting rule, is always; a spell that aims overrides it with the
   * same range its `cast()` looks within.
   */
  protected hasTarget(): boolean {
    return true;
  }

  /** One volley / pulse / strike. Called once per cast the scheduler pays out. */
  protected abstract cast(): void;
}
