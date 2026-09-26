import type { RosterSpellId } from '../config/loadout';
import { LEVEL_UP_CHARGES, type ChargeCard } from '../config/offerActions';
import { PASSIVES, isPassiveId, type Passive } from '../config/passives';
import type { SpellStatField } from '../config/spellFields';
import { MAX_OFFER_SIZE, type OfferCard } from './levelUp';
import { equippableSpells, openSlots, passiveRank, type Loadout } from './loadout';
import type { Rng } from './rng';

/**
 * What a level-up offers (Phase 2 spec §7.1), as one pure function of the run's
 * loadout and level.
 *
 * The state machine has two states and one exit:
 *
 * 1. An active slot is unlocked and empty -> offer the element's unequipped
 *    actives, so a slot is always filled before anything else is handed out.
 * 2. Otherwise -> offer passives that are not at `maxRank` and whose
 *    `requiresStat`, if any, a casting spell carries. Four passives never cap,
 *    so this pool never runs dry the way the Phase 1 perk trees did.
 * 3. Neither pool has a card -> an empty offer, which `resolveLevelUp` answers
 *    with the silent +10 max HP instead of an overlay.
 *
 * An offer is all actives or all passives, never mixed: a card the player will
 * never see again (an active slot's last chance) should not compete against one
 * they can take at any later level.
 *
 * Which actives exist is the caller's to say. `catalog` is every active *this
 * build can actually cast* — the roster spells land with #140-#143, and a card
 * for a spell that cannot be built would cost the player a level-up. When that
 * leaves state 1 with an empty pool, the offer falls through to passives rather
 * than to the +10 HP fallback: the slot stays open for a later level, and the
 * run still gets an upgrade out of the level it earned.
 *
 * #228 adds the run's bans and its rerolls. A banned card is out of both pools
 * for the rest of the run, so banning every spell left falls through to
 * passives the same way. Once any passive is at `maxRank`, the level-up charge
 * cards (+1 Reroll, +1 Ban) join the passive pool for good; they never join a
 * spell offer. None of this draws anything a run that never rerolls or bans,
 * and has no passive capped, did not draw before, so its seed replays the
 * same offers.
 *
 * Pure TS, no Phaser import.
 */

/** One active the build can cast, as its card reads. */
export interface ActiveCard {
  id: RosterSpellId;
  name: string;
  description: string;
  color?: number;
}

/** The actives this build can cast, in any order. */
export type ActiveCatalog = readonly ActiveCard[];

/** Catalog entries this run may still equip: its own element, not already equipped. */
export function offerableActives(loadout: Loadout, catalog: ActiveCatalog): ActiveCard[] {
  const equippable = new Set<string>(equippableSpells(loadout));
  return catalog.filter((active) => equippable.has(active.id));
}

/**
 * Passives below their `maxRank`; an uncapped passive is always eligible
 * (spec §5). A passive outside the shipped list — a test's own config — reads
 * as rank 0, since only shipped ids can be in the loadout's map.
 *
 * A passive with a `requiresStat` is eligible only while `carried` holds that
 * stat (#206). `carried` defaults to empty, so a caller that does not say what
 * its spells carry can never be offered a dead pick.
 */
export function eligiblePassives(
  loadout: Loadout,
  passives: readonly Passive[] = PASSIVES,
  carried: ReadonlySet<SpellStatField> = new Set(),
): Passive[] {
  return passives.filter(
    (passive) =>
      rankOf(loadout, passive.id) < (passive.maxRank ?? Infinity) &&
      (passive.requiresStat === undefined || carried.has(passive.requiresStat)),
  );
}

/** One level-up's inputs. `passives` and `size` default to the shipped config. */
export interface OfferInput {
  loadout: Loadout;
  /**
   * The run's level as it stands now, which is what unlocks a slot. One XP
   * pickup can level a run more than once; every overlay it owes is drawn at
   * the level the run has actually reached, not at the one it passed through.
   */
  level: number;
  /** Every active this build can cast (`ActiveCatalog`). */
  actives: ActiveCatalog;
  /**
   * Every stat the spells casting right now carry in their base blocks
   * (`Spellbook.carriedStats`). Gates a passive's `requiresStat`; absent, no
   * such passive is offered.
   */
  carried?: ReadonlySet<SpellStatField>;
  passives?: readonly Passive[];
  /** Card ids banned this run (#228); never drawn. */
  banned?: ReadonlySet<string>;
  /**
   * The cards just shown, for a reroll (#228). They are drawn only once the
   * rest of the pool has run out, so a short pool still fills the offer.
   */
  exclude?: ReadonlySet<string>;
  /** The charge cards a capped passive lets into the passive pool (#228). */
  charges?: readonly ChargeCard[];
  size?: number;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * Every card this level-up could show, in config order: the unbanned actives
 * for an open slot while there are any, else the unbanned eligible passives
 * and, once a passive caps, the unbanned charge cards.
 */
export function offerPool(input: OfferInput): OfferCard[] {
  const { loadout, level, actives, carried, passives = PASSIVES } = input;
  const { charges = LEVEL_UP_CHARGES, banned = NONE } = input;
  const open = (card: { id: string }): boolean => !banned.has(card.id);

  if (openSlots(loadout, level) > 0) {
    const offerable = offerableActives(loadout, actives).filter(open);
    if (offerable.length > 0) return offerable.map(activeCard);
  }

  const pool = eligiblePassives(loadout, passives, carried)
    .filter(open)
    .map((passive) => passiveCard(loadout, passive));
  if (anyPassiveCapped(loadout, passives)) pool.push(...charges.filter(open).map(chargeCard));
  return pool;
}

/**
 * Draw one level-up's cards. Up to `size` distinct cards, drawn through the
 * run's seeded RNG, so the same seed replays the same offers in the same order.
 * With nothing to `exclude` it is one shuffle of the pool, as before #228.
 */
export function levelUpOffer(rng: Rng, input: OfferInput): OfferCard[] {
  const { exclude = NONE, size = MAX_OFFER_SIZE } = input;
  if (size <= 0) return [];
  const pool = offerPool(input);
  const fresh = pool.filter((card) => !exclude.has(card.id));
  const seen = pool.filter((card) => exclude.has(card.id));
  return [...rng.shuffle(fresh), ...rng.shuffle(seen)].slice(0, size);
}

/**
 * The offer once `bannedId` is banned (#228), which `input.banned` must
 * already hold. The other cards keep their places and the banned card's goes
 * to a fresh draw from the pool, when it has a card not already shown. A ban
 * that empties the offer — its last spell, say — draws a whole new offer from
 * the pool that follows, passives. An empty result is the +10 max HP fallback.
 */
export function offerAfterBan(
  rng: Rng,
  input: OfferInput,
  shown: readonly OfferCard[],
  bannedId: string,
): OfferCard[] {
  const { size = MAX_OFFER_SIZE } = input;
  const pool = offerPool(input);
  const inPool = new Set(pool.map((card) => card.id));
  const kept = shown.filter((card) => card.id !== bannedId && inPool.has(card.id));
  const keptIds = new Set(kept.map((card) => card.id));
  const drawn = rng
    .shuffle(pool.filter((card) => !keptIds.has(card.id)))
    .slice(0, Math.max(0, size - kept.length));
  const at = shown.findIndex((card) => card.id === bannedId);
  kept.splice(at < 0 ? kept.length : at, 0, ...drawn);
  return kept;
}

/** True once any passive in `passives` is at its `maxRank` (#228). */
export function anyPassiveCapped(
  loadout: Loadout,
  passives: readonly Passive[] = PASSIVES,
): boolean {
  return passives.some(
    (passive) => passive.maxRank !== undefined && rankOf(loadout, passive.id) >= passive.maxRank,
  );
}

/** The card for equipping a spell: no rank, since a slot is filled once. */
export function activeCard(active: ActiveCard): OfferCard {
  const card: OfferCard = {
    kind: 'active',
    id: active.id,
    name: active.name,
    description: active.description,
  };
  if (active.color !== undefined) card.color = active.color;
  return card;
}

/** The card for the next rank of a passive; `maxRank` is absent when it never caps. */
export function passiveCard(loadout: Loadout, passive: Passive): OfferCard {
  const card: OfferCard = {
    kind: 'passive',
    id: passive.id,
    name: passive.name,
    description: passive.description,
    rank: rankOf(loadout, passive.id) + 1,
  };
  if (passive.maxRank !== undefined) card.maxRank = passive.maxRank;
  return card;
}

/** The card for a charge (#228): no rank, since it never caps. */
export function chargeCard(charge: ChargeCard): OfferCard {
  return { kind: 'charge', id: charge.id, name: charge.name, description: charge.description };
}

function rankOf(loadout: Loadout, passiveId: string): number {
  return isPassiveId(passiveId) ? passiveRank(loadout, passiveId) : 0;
}
