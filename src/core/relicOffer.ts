import { PROFILE_CLAMPS, type PlayerProfile } from '../config/passives';
import { RELIC_BUFFS, type RelicBuff } from '../config/relics';
import { MAX_OFFER_SIZE, type OfferCard } from './levelUp';
import type { Rng } from './rng';

/**
 * What touching a relic offers (#227), as one pure function of the relic ranks
 * owned and the profile they resolve to.
 *
 * Up to `size` distinct buffs, drawn by weight without replacement, so one
 * offer never shows a buff twice and a short pool shows what is left. A buff
 * whose field is already at its `PROFILE_CLAMPS` bound is left out: a pick
 * that can change nothing is no pick.
 *
 * The caller passes an RNG of the relic offers' own stream, so a relic's draw
 * never moves a seed's level-up offers or its drops.
 *
 * Pure TS, no Phaser import.
 */

/** One relic offer's inputs. `buffs` and `size` default to the shipped config. */
export interface RelicOfferInput {
  /** Relic buff id -> ranks owned (`Loadout.relics`). */
  ranks: ReadonlyMap<string, number>;
  /** The profile as it stands, with every source applied and clamped. */
  profile: Readonly<PlayerProfile>;
  buffs?: readonly RelicBuff[];
  size?: number;
}

export function relicOffer(rng: Rng, input: RelicOfferInput): OfferCard[] {
  const { ranks, profile, buffs = RELIC_BUFFS, size = MAX_OFFER_SIZE } = input;
  const eligible = buffs.filter((buff) => !atCap(buff, profile));
  return weightedSample(rng, eligible, (buff) => buff.weight, size).map((buff) =>
    relicCard(buff, (ranks.get(buff.id) ?? 0) + 1),
  );
}

/**
 * True when `buff`'s field sits at the clamp in the direction the buff moves
 * it — Hourglass lowers `cooldownMul` towards its floor, Windstep raises
 * `moveSpeed` towards its ceiling. A field with no clamp that way never caps.
 */
export function atCap(buff: RelicBuff, profile: Readonly<PlayerProfile>): boolean {
  const clamp = PROFILE_CLAMPS[buff.field];
  const value = profile[buff.field];
  const lowers = buff.op === 'mul' ? buff.amount < 1 : buff.amount < 0;
  if (lowers) return clamp?.min !== undefined && value <= clamp.min;
  return clamp?.max !== undefined && value >= clamp.max;
}

/**
 * Up to `size` distinct items, each draw landing on an item with chance in
 * proportion to its weight among those not drawn yet. One `rng.next()` per
 * draw; an item of weight 0 or less is never drawn.
 */
export function weightedSample<T>(
  rng: Rng,
  items: readonly T[],
  weightOf: (item: T) => number,
  size: number,
): T[] {
  const pool = items.filter((item) => weightOf(item) > 0);
  const out: T[] = [];
  while (out.length < size && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + weightOf(item), 0);
    let at = rng.next() * total;
    // Floating-point slack at the top of the range lands on the last item.
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      at -= weightOf(pool[i] as T);
      if (at < 0) {
        index = i;
        break;
      }
    }
    out.push(...pool.splice(index, 1));
  }
  return out;
}

/** The card for the next rank of a relic buff. Buffs never cap their rank, so no `maxRank`. */
export function relicCard(buff: RelicBuff, rank: number): OfferCard {
  return { kind: 'relic', id: buff.id, name: buff.name, description: buff.description, rank };
}
