import { describe, expect, it } from 'vitest';
import { SLOT_UNLOCK_LEVELS, type RosterSpellId } from '../config/loadout';
import { PASSIVES, type Passive } from '../config/passives';
import { MAX_OFFER_SIZE } from './levelUp';
import {
  eligiblePassives,
  levelUpOffer,
  offerableActives,
  passiveCard,
  type ActiveCard,
} from './levelUpOffer';
import { buildLoadout, equip, takePassive, type Loadout } from './loadout';
import { createRng } from './rng';

const [SLOT_2_LEVEL, SLOT_3_LEVEL] = SLOT_UNLOCK_LEVELS;

/** Every Fire active but the default, as a build that can cast all of them. */
const FIRE_CATALOG: ActiveCard[] = (
  ['fire_meteor', 'fire_column', 'fire_companion', 'fire_dragon'] satisfies RosterSpellId[]
).map((id) => ({ id, name: `Spell ${id}`, description: 'Casts a thing.' }));

const equipOrThrow = (loadout: Loadout, id: RosterSpellId, level: number): Loadout => {
  const result = equip(loadout, id, level);
  if (!result.ok) throw new Error(`equip refused: ${result.reason}`);
  return result.loadout;
};

/** A Fire run with both extra slots filled — the state passives are offered in. */
const fullLoadout = (): Loadout =>
  equipOrThrow(
    equipOrThrow(buildLoadout('fire'), 'fire_meteor', SLOT_2_LEVEL),
    'fire_column',
    SLOT_3_LEVEL,
  );

const idsOf = (loadout: Loadout, level: number, seed = 1, actives = FIRE_CATALOG): string[] =>
  levelUpOffer(createRng(seed), { loadout, level, actives }).map((card) => card.id);

describe('levelUpOffer — actives while a slot is open (spec §7.1)', () => {
  it('offers passives before the first slot unlocks', () => {
    for (const level of [1, SLOT_2_LEVEL - 1]) {
      const offer = levelUpOffer(createRng(1), {
        loadout: buildLoadout('fire'),
        level: level,
        actives: FIRE_CATALOG,
      });
      expect(
        offer.map((card) => card.kind),
        `level ${level}`,
      ).toEqual(['passive', 'passive', 'passive']);
    }
  });

  it('offers actives from the level the slot unlocks', () => {
    const offer = levelUpOffer(createRng(1), {
      loadout: buildLoadout('fire'),
      level: SLOT_2_LEVEL,
      actives: FIRE_CATALOG,
    });
    expect(offer).toHaveLength(MAX_OFFER_SIZE);
    for (const card of offer) {
      expect(card.kind).toBe('active');
      expect(card.rank).toBeUndefined();
      expect(card.maxRank).toBeUndefined();
    }
  });

  it('never offers a spell this run already has', () => {
    const loadout = equipOrThrow(buildLoadout('fire'), 'fire_meteor', SLOT_2_LEVEL);
    // Every draw at the second slot's level, over many seeds: the default and
    // the one already equipped must never appear.
    for (let seed = 1; seed <= 50; seed++) {
      const ids = idsOf(loadout, SLOT_3_LEVEL, seed);
      expect(ids, `seed ${seed}`).not.toContain('fire');
      expect(ids, `seed ${seed}`).not.toContain('fire_meteor');
    }
  });

  it('never offers another element’s spell', () => {
    const catalog: ActiveCard[] = [
      ...FIRE_CATALOG,
      { id: 'ice_blizzard', name: 'Blizzard', description: 'Cold.' },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      expect(idsOf(buildLoadout('fire'), SLOT_2_LEVEL, seed, catalog)).not.toContain(
        'ice_blizzard',
      );
    }
  });

  it('draws three distinct actives', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = idsOf(buildLoadout('fire'), SLOT_2_LEVEL, seed);
      expect(new Set(ids).size, `seed ${seed}`).toBe(ids.length);
    }
  });
});

describe('levelUpOffer — passives once the loadout is full (spec §7.1)', () => {
  it('offers passives, and only passives, at the level after the last slot fills', () => {
    const offer = levelUpOffer(createRng(1), {
      loadout: fullLoadout(),
      level: SLOT_3_LEVEL + 1,
      actives: FIRE_CATALOG,
    });
    expect(offer).toHaveLength(MAX_OFFER_SIZE);
    for (const card of offer) {
      expect(card.kind).toBe('passive');
      expect(card.rank).toBe(1);
    }
  });

  it('makes the level-up that fills the last slot the last active offer', () => {
    // The last slot is still open at its unlock level, so that level-up is an
    // active offer; the pick fills it, and every level after it is passives.
    const open = equipOrThrow(buildLoadout('fire'), 'fire_meteor', SLOT_2_LEVEL);
    const atBoundary = levelUpOffer(createRng(1), {
      loadout: open,
      level: SLOT_3_LEVEL,
      actives: FIRE_CATALOG,
    });
    expect(atBoundary.every((card) => card.kind === 'active')).toBe(true);

    const [first] = atBoundary;
    if (!first) throw new Error('expected an active offer at the last slot’s unlock level');
    const filled = equipOrThrow(open, first.id as RosterSpellId, SLOT_3_LEVEL);
    const afterward = levelUpOffer(createRng(1), {
      loadout: filled,
      level: SLOT_3_LEVEL,
      actives: FIRE_CATALOG,
    });
    expect(afterward.every((card) => card.kind === 'passive')).toBe(true);
  });

  it('draws three distinct passives', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ids = idsOf(fullLoadout(), SLOT_3_LEVEL + 1, seed);
      expect(new Set(ids).size, `seed ${seed}`).toBe(ids.length);
    }
  });

  it('numbers the rank a pick grants, and caps only what the config caps', () => {
    const magnet = PASSIVES.find((p) => p.id === 'passive_magnet') as Passive;
    const power = PASSIVES.find((p) => p.id === 'passive_power') as Passive;
    const loadout = takePassive(takePassive(fullLoadout(), 'passive_magnet'), 'passive_magnet');

    expect(passiveCard(loadout, magnet)).toEqual({
      kind: 'passive',
      id: 'passive_magnet',
      name: magnet.name,
      description: magnet.description,
      rank: 3,
      maxRank: 3,
    });
    // Power never caps, so its card carries no maxRank at any rank.
    expect(passiveCard(loadout, power).maxRank).toBeUndefined();
    expect(passiveCard(loadout, power).rank).toBe(1);
  });

  it('drops a passive that has reached its maxRank', () => {
    let loadout = fullLoadout();
    for (let rank = 0; rank < 3; rank++) loadout = takePassive(loadout, 'passive_magnet');
    expect(eligiblePassives(loadout).map((p) => p.id)).not.toContain('passive_magnet');
    for (let seed = 1; seed <= 50; seed++) {
      expect(idsOf(loadout, SLOT_3_LEVEL + 1, seed), `seed ${seed}`).not.toContain(
        'passive_magnet',
      );
    }
  });

  it('keeps an uncapped passive eligible however many ranks it holds', () => {
    let loadout = fullLoadout();
    for (let rank = 0; rank < 20; rank++) loadout = takePassive(loadout, 'passive_power');
    expect(eligiblePassives(loadout).map((p) => p.id)).toContain('passive_power');
  });
});

describe('levelUpOffer — what the build can actually cast', () => {
  it('falls through to passives when no offerable active exists', () => {
    // Today's build: the roster spells have no implementation, so the catalog
    // is empty and an open slot still has to pay the level-up out.
    const offer = levelUpOffer(createRng(1), {
      loadout: buildLoadout('fire'),
      level: SLOT_2_LEVEL,
      actives: [],
    });
    expect(offer).toHaveLength(MAX_OFFER_SIZE);
    expect(offer.every((card) => card.kind === 'passive')).toBe(true);
  });

  it('offers only the actives the catalog names', () => {
    const catalog = FIRE_CATALOG.slice(0, 1);
    expect(offerableActives(buildLoadout('fire'), catalog).map((a) => a.id)).toEqual([
      'fire_meteor',
    ]);
    expect(idsOf(buildLoadout('fire'), SLOT_2_LEVEL, 1, catalog)).toEqual(['fire_meteor']);
  });

  it('offers nothing when neither pool has a card — the +10 HP fallback', () => {
    // Unreachable with the shipped passives (four never cap), which is why the
    // spec keeps this case: it is the defined behaviour for a config where
    // every passive is capped.
    const capped: Passive[] = [{ ...(PASSIVES[0] as Passive), id: 'passive_magnet', maxRank: 1 }];
    const loadout = takePassive(fullLoadout(), 'passive_magnet');
    expect(eligiblePassives(loadout, capped)).toEqual([]);
    expect(
      levelUpOffer(createRng(1), {
        loadout,
        level: SLOT_3_LEVEL + 1,
        actives: [],
        passives: capped,
      }),
    ).toEqual([]);
  });
});

describe('levelUpOffer — determinism (spec §7.2)', () => {
  it('replays the same offers for the same seed, actives and passives alike', () => {
    for (const [loadout, level] of [
      [buildLoadout('fire'), SLOT_2_LEVEL],
      [fullLoadout(), SLOT_3_LEVEL + 1],
    ] as const) {
      expect(idsOf(loadout, level, 7)).toEqual(idsOf(loadout, level, 7));
    }
  });

  it('draws in the order the run’s rng dictates, not the config order', () => {
    const rng = createRng(3);
    const draw = (): string[] =>
      levelUpOffer(rng, { loadout: fullLoadout(), level: SLOT_3_LEVEL + 1, actives: [] }).map(
        (card) => card.id,
      );
    const first = draw();
    const second = draw();
    // Two draws off one rng advance its state, so a run is not handed the same
    // three cards every level.
    expect(second).not.toEqual(first);
  });
});
