import type { RosterSpellId } from '../config/loadout';
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
  size?: number;
}

/**
 * Draw one level-up's cards. Up to `size` distinct cards, drawn through the
 * run's seeded RNG, so the same seed replays the same offers in the same order.
 */
export function levelUpOffer(rng: Rng, input: OfferInput): OfferCard[] {
  const { loadout, level, actives, carried, passives = PASSIVES, size = MAX_OFFER_SIZE } = input;
  if (size <= 0) return [];

  if (openSlots(loadout, level) > 0) {
    const offerable = offerableActives(loadout, actives);
    if (offerable.length > 0) return rng.shuffle(offerable).slice(0, size).map(activeCard);
  }

  return rng
    .shuffle(eligiblePassives(loadout, passives, carried))
    .slice(0, size)
    .map((passive) => passiveCard(loadout, passive));
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

function rankOf(loadout: Loadout, passiveId: string): number {
  return isPassiveId(passiveId) ? passiveRank(loadout, passiveId) : 0;
}
