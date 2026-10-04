import { RELIC_CHARGES, type ChargeCard } from '../config/offerActions';
import type { PlayerProfile } from '../config/passives';
import { RELIC_BUFFS, type RelicBuff } from '../config/relics';
import type { SpellStatField } from '../config/spellFields';
import { MAX_OFFER_SIZE, type OfferCard } from './levelUp';
import { chargeCard } from './levelUpOffer';
import { atCap } from './profileClamp';
import type { Rng } from './rng';

/**
 * What touching a relic offers (#227), as one pure function of the relic ranks
 * owned and the profile they resolve to.
 *
 * Up to `size` distinct buffs, drawn by weight without replacement, so one
 * offer never shows a buff twice and a short pool shows what is left. A buff
 * whose field is already at its `PROFILE_CLAMPS` bound is left out: a pick
 * that can change nothing is no pick. A buff with `requiresStat` (#377) is
 * offered only while a casting spell carries that stat, as for the passives.
 * The relic charge cards (#228: +2 Rerolls, +1 Ban) are always in the pool, at
 * their own lower weight.
 *
 * The caller passes an RNG of the relic offers' own stream, so a relic's draw
 * never moves a seed's level-up offers or its drops.
 *
 * CO-239 adds the run's bans and a reroll's `exclude`, as on a level-up: a
 * banned card is out of the pool, and an excluded one is drawn only once the
 * rest run out. With neither, the draw is the same as before.
 *
 * Pure TS, no Phaser import.
 */

/** One relic offer's inputs. `buffs` and `size` default to the shipped config. */
export interface RelicOfferInput {
  /** Relic buff id -> ranks owned (`Loadout.relics`). */
  ranks: ReadonlyMap<string, number>;
  /** The profile as it stands, with every source applied and clamped. */
  profile: Readonly<PlayerProfile>;
  /** Stats the casting spells carry (#377); empty by default, so a dead pick is never offered. */
  carried?: ReadonlySet<SpellStatField>;
  /** Card ids banned this run (CO-239); never drawn. */
  banned?: ReadonlySet<string>;
  /** The cards a reroll replaces (CO-239); drawn only once the rest of the pool runs out. */
  exclude?: ReadonlySet<string>;
  buffs?: readonly RelicBuff[];
  charges?: readonly ChargeCard[];
  size?: number;
}

export function relicOffer(rng: Rng, input: RelicOfferInput): OfferCard[] {
  const { exclude = NONE, size = MAX_OFFER_SIZE } = input;
  const pool = relicPool(input);
  const fresh = weightedSample(
    rng,
    pool.filter((entry) => !exclude.has(entry.card.id)),
    (entry) => entry.weight,
    size,
  );
  const seen = weightedSample(
    rng,
    pool.filter((entry) => exclude.has(entry.card.id)),
    (entry) => entry.weight,
    size - fresh.length,
  );
  return [...fresh, ...seen].map((entry) => entry.card);
}

/**
 * The relic offer once `bannedId` is banned (CO-239), which `input.banned`
 * must already hold. The other cards keep their places and the banned card's
 * goes to a fresh draw; a pool too short to fill it leaves the offer shorter.
 */
export function relicOfferAfterBan(
  rng: Rng,
  input: RelicOfferInput,
  shown: readonly OfferCard[],
  bannedId: string,
): OfferCard[] {
  const { size = MAX_OFFER_SIZE } = input;
  const pool = relicPool(input);
  const inPool = new Set(pool.map((entry) => entry.card.id));
  const kept = shown.filter((card) => card.id !== bannedId && inPool.has(card.id));
  const keptIds = new Set(kept.map((card) => card.id));
  const drawn = weightedSample(
    rng,
    pool.filter((entry) => !keptIds.has(entry.card.id)),
    (entry) => entry.weight,
    size - kept.length,
  ).map((entry) => entry.card);
  const at = shown.findIndex((card) => card.id === bannedId);
  kept.splice(at < 0 ? kept.length : at, 0, ...drawn);
  return kept;
}

const NONE: ReadonlySet<string> = new Set();

/** Every card a relic could show now, with its draw weight, in config order. */
function relicPool(input: RelicOfferInput): { weight: number; card: OfferCard }[] {
  const { ranks, profile, buffs = RELIC_BUFFS, charges = RELIC_CHARGES, banned = NONE } = input;
  const carried = input.carried ?? new Set<SpellStatField>();
  return [
    ...buffs
      .filter(
        (buff) =>
          !banned.has(buff.id) &&
          (buff.requiresStat === undefined || carried.has(buff.requiresStat)) &&
          !atCap(buff, profile),
      )
      .map((buff) => ({
        weight: buff.weight,
        card: relicCard(buff, (ranks.get(buff.id) ?? 0) + 1),
      })),
    ...charges
      .filter((charge) => !banned.has(charge.id))
      .map((charge) => ({ weight: charge.weight, card: chargeCard(charge) })),
  ];
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
