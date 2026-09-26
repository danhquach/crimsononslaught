import type { ShieldSpellId } from '../config/shields';
import { Spell } from '../core/spell';
import type { SpellStatsBySpell } from '../core/spellStats';
import {
  absorb,
  createShield,
  EMPTY_TALLY,
  isUp,
  tallyShield,
  tickShield,
  type ShieldRule,
  type ShieldState,
  type ShieldTally,
} from '../core/shield';

/**
 * A spell that stands in front of the player's HP (#134, Phase 2 spec §9): it
 * holds an absorption pool, refills it when it is left alone, and fires its own
 * break effect the once when a hit empties it.
 *
 * Both shields share every rule of the pool (`core/shield.ts`) and differ only
 * in what they draw and what a break does, so a subclass brings a break effect
 * and a way to draw itself and nothing else. Like Earth's ring a shield is
 * always out rather than cast, so `tick` runs every frame and `cast` is never
 * called; ticking from here rather than from `runChildUpdate` is what keeps a
 * paused Game — a level-up overlay — from recharging the shield for free.
 *
 * The rule is read from the live block every frame rather than stored, because
 * a shield lives as long as it is equipped and therefore feels a passive the
 * moment it is taken (spec §6.2): a Haste shortens the wait the player is
 * already in.
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
    const result = absorb(this.state, amount, this.rule);
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

  /** The pool's numbers as the live block says them right now. */
  protected get rule(): ShieldRule {
    const { shieldHp, rechargeDelay } = this.stats as { shieldHp: number; rechargeDelay: number };
    return { max: shieldHp, rechargeDelayS: rechargeDelay };
  }

  protected override tick(deltaS: number): void {
    const next = tickShield(this.state, deltaS, this.rule);
    this.tallied = tallyShield(this.tallied, this.state, next);
    this.state = next;
  }

  /** Never called: a shield has no cooldown, it is simply up or recharging. */
  protected cast(): void {}

  /** What the shield does as it falls — fired exactly once per break. */
  protected abstract onBreak(): void;
}
