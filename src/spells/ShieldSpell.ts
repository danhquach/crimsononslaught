import type { ShieldSpellId } from '../config/shields';
import { Spell } from '../core/spell';
import type { SpellStatsBySpell } from '../core/spellStats';
import {
  absorb,
  createShield,
  EMPTY_TALLY,
  isUp,
  tallyShield,
  type ShieldRule,
  type ShieldState,
  type ShieldTally,
} from '../core/shield';

/**
 * A spell that stands in front of the player's HP (#134, Phase 2 spec §9): it
 * holds an absorption pool and fires its own break effect the once when a hit
 * empties it.
 *
 * Both shields share every rule of the pool (`core/shield.ts`) and differ only
 * in what they draw and what a break does, so a subclass brings a break effect
 * and a way to draw itself and nothing else. Both are rings on a timer (#406):
 * their own cycle refills the pool when the ring returns and empties it when
 * the ring goes (`refillPool`, `emptyPool`). A shield is out on its own rather
 * than cast, so the subclass's `tick` runs every frame and `cast` is never
 * called; ticking from here rather than from `runChildUpdate` is what keeps a
 * paused Game, a level-up overlay, from running the cycle for free.
 *
 * The rule is read from the live block every frame rather than stored, because
 * a shield lives as long as it is equipped and therefore feels a passive the
 * moment it is taken (spec §6.2).
 */
export abstract class ShieldSpell<S extends ShieldSpellId> extends Spell<S> {
  private state: ShieldState;
  /** Test hook (#260): what the pool has swallowed and grown back, across the run. */
  private tallied: ShieldTally = EMPTY_TALLY;

  constructor(id: S, stats: SpellStatsBySpell[S]) {
    super(id, stats);
    // Up from the first frame: a shield the player has to wait for would be
    // the one thing in the loadout that is not there when it is equipped.
    this.state = createShield(this.rule);
  }

  /** Damage the pool can still swallow — what the HUD's shield bar reads. */
  get pool(): number {
    return this.state.pool;
  }

  /** What a full pool holds, as the live block says it. */
  get maxPool(): number {
    return this.rule.max;
  }

  /** Whether the shield is standing; a broken one absorbs nothing and is not drawn. */
  get up(): boolean {
    return isUp(this.state);
  }

  /**
   * Damage absorbed and points regrown so far. A refill can come and go
   * between two polls on a slow runner, so the browser suite counts it here
   * rather than sampling the pool.
   */
  get tally(): ShieldTally {
    return this.tallied;
  }

  /**
   * Put one hit on the player through this shield and return what is left for
   * their HP. Called from `GameScene`'s one player-intake path, before
   * `Player.takeDamage` (spec §6.2: a shield absorbs before `damageReduction`,
   * which `core/health.ts` applies to what passes through — #139).
   */
  absorbDamage(amount: number): number {
    const result = absorb(this.state, amount);
    this.tallied = tallyShield(this.tallied, this.state, result.state);
    this.state = result.state;
    // `broke` is true only on the transition to 0, so overlapping contacts in
    // one frame play one break rather than one each.
    if (result.broke) this.onBreak();
    return result.passThrough;
  }

  /** How full the pool is, 0-1; what the layer's alpha and the HUD bar follow. */
  protected get fill(): number {
    const { max } = this.rule;
    return max > 0 ? Math.min(1, Math.max(0, this.pool / max)) : 0;
  }

  /**
   * The pool's numbers as the live block says them right now. No shield regrows
   * (#406): each one's own cycle refills it.
   */
  protected get rule(): ShieldRule {
    const { shieldHp } = this.stats as { shieldHp: number };
    return { max: shieldHp };
  }

  /**
   * The pool full at once, for a shield that comes and goes on a timer rather
   * than regrowing (#406). Counted as regrown in the tally.
   */
  protected refillPool(): void {
    const next = createShield(this.rule);
    this.tallied = tallyShield(this.tallied, this.state, next);
    this.state = next;
  }

  /**
   * The pool empty at once, with nothing to wait for: the timer brings it back.
   * Not an absorption, so the tally is left alone.
   */
  protected emptyPool(): void {
    this.state = { pool: 0 };
  }

  /** Never called: a shield has no cooldown, it is simply up or recharging. */
  protected cast(): void {}

  /** What the shield does as it falls — fired exactly once per break. */
  protected abstract onBreak(): void;
}
