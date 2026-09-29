import { describe, expect, it } from 'vitest';
import { SLOT_UNLOCK_LEVELS, type RosterSpellId } from '../config/loadout';
import { LEVEL_UP_CHARGES } from '../config/offerActions';
import {
  BASE_PLAYER_PROFILE,
  PASSIVES,
  PROFILE_CLAMPS,
  type Passive,
  type PlayerProfile,
} from '../config/passives';
import { MAX_SPELL_LEVEL, type SpellLevelTable } from '../config/spellLevels';
import { MAX_OFFER_SIZE, isOfferCard, resolveLevelUp, type OfferCard } from './levelUp';
import {
  activeCard,
  anyPassiveCapped,
  eligiblePassives,
  levelUpOffer,
  offerAfterBan,
  offerPool,
  offerableActives,
  passiveCard,
  spellUpgradeCard,
  upgradeableSpells,
  type ActiveCard,
  type OfferInput,
} from './levelUpOffer';
import { OFFER_GOLDEN } from './levelUpOffer.golden';
import { buildLoadout, equip, openSlots, takePassive, upgradeSpell, type Loadout } from './loadout';
import { createRng, type Rng } from './rng';

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
      { id: 'ice_blizzard', name: 'Ice Storm', description: 'Cold.' },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      expect(idsOf(buildLoadout('fire'), SLOT_2_LEVEL, seed, catalog)).not.toContain(
        'ice_blizzard',
      );
    }
  });

  it('carries each active’s colour onto its card, and none when it has none (CO-155)', () => {
    const colored = FIRE_CATALOG.map((active, i) => ({ ...active, color: 0x100 * (i + 1) }));
    const offer = levelUpOffer(createRng(1), {
      loadout: buildLoadout('fire'),
      level: SLOT_2_LEVEL,
      actives: colored,
    });
    for (const card of offer) {
      expect(card.color).toBe(colored.find((active) => active.id === card.id)?.color);
    }
    expect(
      activeCard({ id: 'fire_meteor', name: 'Meteor', description: 'Falls.' }),
    ).not.toHaveProperty('color');
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

describe('levelUpOffer — no passive at its clamp (#315)', () => {
  const at = (over: Partial<PlayerProfile>): PlayerProfile => ({ ...BASE_PLAYER_PROFILE, ...over });
  const eligibleIds = (profile?: PlayerProfile): string[] =>
    eligiblePassives(fullLoadout(), PASSIVES, undefined, profile).map((p) => p.id);
  const offeredIds = (profile: PlayerProfile | undefined, seed: number): string[] =>
    levelUpOffer(createRng(seed), {
      loadout: fullLoadout(),
      level: SLOT_3_LEVEL + 1,
      actives: [],
      profile,
    }).map((card) => card.id);

  it('drops Haste once cooldownMul is on its floor, and keeps it one step above', () => {
    expect(eligibleIds(at({ cooldownMul: 0.35 }))).not.toContain('passive_haste');
    expect(eligibleIds(at({ cooldownMul: 0.36 }))).toContain('passive_haste');
  });

  it('drops Ward at the damageReduction clamp and Precision at the critChance clamp', () => {
    const ward = PROFILE_CLAMPS.damageReduction?.max ?? NaN;
    const crit = PROFILE_CLAMPS.critChance?.max ?? NaN;
    expect(eligibleIds(at({ damageReduction: ward }))).not.toContain('passive_ward');
    expect(eligibleIds(at({ damageReduction: ward - 0.05 }))).toContain('passive_ward');
    expect(eligibleIds(at({ critChance: crit }))).not.toContain('passive_precision');
    expect(eligibleIds(at({ critChance: crit - 0.05 }))).toContain('passive_precision');
  });

  it('never draws a capped passive into an offer, whatever the seed', () => {
    const capped = at({ cooldownMul: 0.35, damageReduction: 0.6, critChance: 0.75 });
    for (let seed = 1; seed <= 100; seed++) {
      const ids = offeredIds(capped, seed);
      for (const dead of ['passive_haste', 'passive_ward', 'passive_precision']) {
        expect(ids, `seed ${seed}`).not.toContain(dead);
      }
    }
  });

  it('is unchanged without a profile', () => {
    expect(eligibleIds(undefined)).toEqual(eligibleIds(at({})));
    expect(eligibleIds(undefined)).toContain('passive_haste');
    for (let seed = 1; seed <= 20; seed++) {
      expect(offeredIds(undefined, seed)).toEqual(offeredIds(at({}), seed));
    }
  });
});

describe('levelUpOffer — Pierce only while a spell pierces (#206)', () => {
  const PIERCING = new Set(['damage', 'pierce'] as const);
  const offersPierce = (loadout: Loadout, carried?: ReadonlySet<'damage' | 'pierce'>): boolean => {
    for (let seed = 1; seed <= 100; seed++) {
      const offer = levelUpOffer(createRng(seed), {
        loadout,
        level: SLOT_3_LEVEL + 1,
        actives: [],
        carried,
      });
      if (offer.some((card) => card.id === 'passive_pierce')) return true;
    }
    return false;
  };

  it('never offers Pierce when no casting spell carries pierce', () => {
    const ids = (carried?: ReadonlySet<'damage'>): string[] =>
      eligiblePassives(fullLoadout(), PASSIVES, carried).map((p) => p.id);
    expect(ids()).not.toContain('passive_pierce');
    expect(ids(new Set(['damage']))).not.toContain('passive_pierce');
    expect(offersPierce(fullLoadout())).toBe(false);
    expect(offersPierce(fullLoadout(), new Set(['damage']))).toBe(false);
  });

  it('offers Pierce while one does, until it reaches rank 3', () => {
    let loadout = fullLoadout();
    expect(eligiblePassives(loadout, PASSIVES, PIERCING).map((p) => p.id)).toContain(
      'passive_pierce',
    );
    expect(offersPierce(loadout, PIERCING)).toBe(true);

    for (let rank = 0; rank < 3; rank++) loadout = takePassive(loadout, 'passive_pierce');
    expect(eligiblePassives(loadout, PASSIVES, PIERCING).map((p) => p.id)).not.toContain(
      'passive_pierce',
    );
    expect(offersPierce(loadout, PIERCING)).toBe(false);
    expect(() => takePassive(loadout, 'passive_pierce')).toThrow();
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
        // A capped passive lets the charge cards in (#228); without them the
        // pool is empty.
        charges: [],
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

const CHARGE_IDS = LEVEL_UP_CHARGES.map((charge) => charge.id);

/** A full Fire run with Magnet at its cap (3), the first passive a run can cap. */
const cappedLoadout = (): Loadout => {
  let loadout = fullLoadout();
  for (let rank = 0; rank < 3; rank++) loadout = takePassive(loadout, 'passive_magnet');
  return loadout;
};

const PASSIVE_LEVEL = SLOT_3_LEVEL + 1;

describe('levelUpOffer — seeds stay stable without #228 (#228)', () => {
  /** The draw exactly as it stood before #228, to hold the new one to. */
  const before = (rng: Rng, input: OfferInput): OfferCard[] => {
    const { loadout, level, actives, carried } = input;
    if (openSlots(loadout, level) > 0) {
      const offerable = offerableActives(loadout, actives);
      if (offerable.length > 0) return rng.shuffle(offerable).slice(0, 3).map(activeCard);
    }
    return rng
      .shuffle(eligiblePassives(loadout, PASSIVES, carried))
      .slice(0, 3)
      .map((passive) => passiveCard(loadout, passive));
  };

  /** An rng that counts its draws. */
  const counting = (seed: number): Rng & { draws: number } => {
    const inner = createRng(seed);
    const rng = {
      ...inner,
      draws: 0,
      next: () => {
        rng.draws += 1;
        return inner.next();
      },
    };
    rng.int = (min, max) => min + Math.floor(rng.next() * (max - min + 1));
    rng.shuffle = <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    };
    return rng;
  };

  it('draws the same cards with the same number of draws when nothing is banned or capped', () => {
    const cases: [Loadout, number][] = [
      [buildLoadout('fire'), 1],
      [buildLoadout('fire'), SLOT_2_LEVEL],
      [fullLoadout(), PASSIVE_LEVEL],
      [takePassive(takePassive(fullLoadout(), 'passive_magnet'), 'passive_vitality'), 20],
    ];
    for (const [loadout, level] of cases) {
      expect(anyPassiveCapped(loadout)).toBe(false);
      for (let seed = 1; seed <= 100; seed++) {
        const input: OfferInput = { loadout, level, actives: FIRE_CATALOG, banned: new Set() };
        const now = counting(seed);
        const then = counting(seed);
        expect(levelUpOffer(now, input), `level ${level} seed ${seed}`).toEqual(
          before(then, input),
        );
        expect(now.draws).toBe(then.draws);
      }
    }
  });
});

describe('levelUpOffer — bans (#228)', () => {
  it('never draws a banned passive, and keeps drawing the rest', () => {
    const banned = new Set(['passive_power', 'passive_haste']);
    for (let seed = 1; seed <= 100; seed++) {
      const offer = levelUpOffer(createRng(seed), {
        loadout: fullLoadout(),
        level: PASSIVE_LEVEL,
        actives: [],
        banned,
      });
      expect(offer).toHaveLength(MAX_OFFER_SIZE);
      for (const card of offer) expect(banned.has(card.id), `seed ${seed}`).toBe(false);
    }
  });

  it('never draws a banned spell for an open slot', () => {
    const banned = new Set(['fire_meteor']);
    for (let seed = 1; seed <= 50; seed++) {
      const offer = levelUpOffer(createRng(seed), {
        loadout: buildLoadout('fire'),
        level: SLOT_2_LEVEL,
        actives: FIRE_CATALOG,
        banned,
      });
      expect(offer.map((c) => c.kind)).toEqual(['active', 'active', 'active']);
      expect(offer.map((c) => c.id)).not.toContain('fire_meteor');
    }
  });

  it('falls through to passives when every spell left is banned', () => {
    const offer = levelUpOffer(createRng(1), {
      loadout: buildLoadout('fire'),
      level: SLOT_2_LEVEL,
      actives: FIRE_CATALOG,
      banned: new Set(FIRE_CATALOG.map((a) => a.id)),
    });
    expect(offer.map((c) => c.kind)).toEqual(['passive', 'passive', 'passive']);
  });

  it('shows what is left of a pool bans have thinned, and nothing once it is empty', () => {
    const two: Passive[] = PASSIVES.slice(0, 2);
    const input = { loadout: fullLoadout(), level: PASSIVE_LEVEL, actives: [], passives: two };
    const [first, second] = two;
    if (!first || !second) throw new Error('passive list changed');
    const one = levelUpOffer(createRng(1), { ...input, banned: new Set([first.id]) });
    expect(one.map((c) => c.id)).toEqual([second.id]);
    const none = levelUpOffer(createRng(1), { ...input, banned: new Set([first.id, second.id]) });
    expect(none).toEqual([]);
    expect(resolveLevelUp(none).kind).toBe('fallback');
  });

  it('keeps a banned passive the run already holds out of the offer', () => {
    const loadout = takePassive(fullLoadout(), 'passive_vitality');
    for (let seed = 1; seed <= 50; seed++) {
      const ids = levelUpOffer(createRng(seed), {
        loadout,
        level: PASSIVE_LEVEL,
        actives: [],
        banned: new Set(['passive_vitality']),
      }).map((c) => c.id);
      expect(ids).not.toContain('passive_vitality');
    }
  });
});

describe('levelUpOffer — reroll excludes the cards just shown (#228)', () => {
  it('draws 3 cards none of which were just shown, when the pool has 3 others', () => {
    const input = { loadout: fullLoadout(), level: PASSIVE_LEVEL, actives: [] };
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const shown = levelUpOffer(rng, input);
      const exclude = new Set(shown.map((c) => c.id));
      const rerolled = levelUpOffer(rng, { ...input, exclude });
      expect(rerolled).toHaveLength(MAX_OFFER_SIZE);
      for (const card of rerolled) expect(exclude.has(card.id), `seed ${seed}`).toBe(false);
    }
  });

  it('fills a short pool with the cards just shown, the unseen ones first', () => {
    // Four spells for a slot: a reroll of three shows the fourth for certain.
    for (let seed = 1; seed <= 50; seed++) {
      const input = { loadout: buildLoadout('fire'), level: SLOT_2_LEVEL, actives: FIRE_CATALOG };
      const rng = createRng(seed);
      const shown = levelUpOffer(rng, input);
      const rerolled = levelUpOffer(rng, { ...input, exclude: new Set(shown.map((c) => c.id)) });
      const unseen = FIRE_CATALOG.find((a) => !shown.some((c) => c.id === a.id));
      expect(rerolled).toHaveLength(MAX_OFFER_SIZE);
      expect(rerolled[0]?.id).toBe(unseen?.id);
      expect(new Set(rerolled.map((c) => c.id)).size).toBe(MAX_OFFER_SIZE);
    }
  });
});

describe('levelUpOffer — charge cards once a passive caps (#228)', () => {
  it('keeps +1 Reroll and +1 Ban out of the pool until a passive caps', () => {
    let loadout = fullLoadout();
    for (let rank = 0; rank < 2; rank++) {
      loadout = takePassive(loadout, 'passive_magnet');
      const ids = offerPool({ loadout, level: PASSIVE_LEVEL, actives: [] }).map((c) => c.id);
      for (const id of CHARGE_IDS) expect(ids).not.toContain(id);
    }
  });

  it('puts both in the passive pool once one does, as valid cards that never cap', () => {
    const pool = offerPool({ loadout: cappedLoadout(), level: PASSIVE_LEVEL, actives: [] });
    const charges = pool.filter((c) => c.kind === 'charge');
    expect(charges.map((c) => c.id)).toEqual(CHARGE_IDS);
    for (const card of charges) {
      expect(isOfferCard(card)).toBe(true);
      expect(card.rank).toBeUndefined();
    }
  });

  it('draws them like any other passive, never twice in one offer', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const offer = levelUpOffer(createRng(seed), {
        loadout: cappedLoadout(),
        level: PASSIVE_LEVEL,
        actives: [],
      });
      expect(new Set(offer.map((c) => c.id)).size).toBe(offer.length);
      for (const card of offer) if (card.kind === 'charge') seen.add(card.id);
    }
    expect([...seen].sort()).toEqual([...CHARGE_IDS].sort());
  });

  it('never shows them in a spell offer', () => {
    // A capped passive and an open slot: the slot's spells come first.
    const loadout = takePassive(
      takePassive(takePassive(buildLoadout('fire'), 'passive_magnet'), 'passive_magnet'),
      'passive_magnet',
    );
    for (let seed = 1; seed <= 50; seed++) {
      const offer = levelUpOffer(createRng(seed), {
        loadout,
        level: SLOT_2_LEVEL,
        actives: FIRE_CATALOG,
      });
      expect(offer.every((c) => c.kind === 'active')).toBe(true);
    }
  });

  it('can be banned like any other card', () => {
    const [reroll] = CHARGE_IDS;
    const ids = offerPool({
      loadout: cappedLoadout(),
      level: PASSIVE_LEVEL,
      actives: [],
      banned: new Set([reroll as string]),
    }).map((c) => c.id);
    expect(ids).not.toContain(reroll);
    expect(ids).toContain(CHARGE_IDS[1]);
  });
});

describe('offerAfterBan (#228)', () => {
  const passiveInput = { loadout: fullLoadout(), level: PASSIVE_LEVEL, actives: [] };

  it('replaces the banned card in its place and keeps the others', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const shown = levelUpOffer(rng, passiveInput);
      for (const at of [0, 1, 2]) {
        const bannedId = shown[at]?.id as string;
        const after = offerAfterBan(
          createRng(seed + 1000),
          { ...passiveInput, banned: new Set([bannedId]) },
          shown,
          bannedId,
        );
        expect(after).toHaveLength(MAX_OFFER_SIZE);
        expect(after.map((c) => c.id)).not.toContain(bannedId);
        for (const i of [0, 1, 2].filter((i) => i !== at)) expect(after[i]).toEqual(shown[i]);
        expect(new Set(after.map((c) => c.id)).size, `seed ${seed}`).toBe(MAX_OFFER_SIZE);
      }
    }
  });

  it('shrinks the offer when the pool has no other card', () => {
    const two: Passive[] = PASSIVES.slice(0, 2);
    const input = { ...passiveInput, passives: two };
    const shown = levelUpOffer(createRng(1), input);
    expect(shown).toHaveLength(2);
    const bannedId = shown[0]?.id as string;
    const after = offerAfterBan(
      createRng(2),
      { ...input, banned: new Set([bannedId]) },
      shown,
      bannedId,
    );
    expect(after).toEqual([shown[1]]);
  });

  it('gives the +10 HP fallback when the ban empties the pool', () => {
    const one: Passive[] = PASSIVES.slice(0, 1);
    const input = { ...passiveInput, passives: one };
    const shown = levelUpOffer(createRng(1), input);
    const bannedId = shown[0]?.id as string;
    const after = offerAfterBan(
      createRng(2),
      { ...input, banned: new Set([bannedId]) },
      shown,
      bannedId,
    );
    expect(after).toEqual([]);
    expect(resolveLevelUp(after).kind).toBe('fallback');
  });

  it('falls through to 3 passives when the last spell for a slot is banned', () => {
    const [only] = FIRE_CATALOG;
    const input = {
      loadout: buildLoadout('fire'),
      level: SLOT_2_LEVEL,
      actives: [only as ActiveCard],
    };
    const shown = levelUpOffer(createRng(1), input);
    expect(shown.map((c) => c.id)).toEqual([only?.id]);
    const after = offerAfterBan(
      createRng(2),
      { ...input, banned: new Set([only?.id as string]) },
      shown,
      only?.id as string,
    );
    expect(after.map((c) => c.kind)).toEqual(['passive', 'passive', 'passive']);
  });
});

/** Every spell of the Fire runs above as its card reads: the default, then the extras. */
const FIRE_CASTING: ActiveCard[] = [
  { id: 'fire', name: 'Fire Bolt', description: 'Throws a bolt.', color: 0xff5500 },
  ...FIRE_CATALOG,
];

/** Level text for the default spell and Meteor, so both can be offered an upgrade. */
const TABLE: SpellLevelTable = {
  fire: { 2: 'Throws a second bolt.', 3: 'Bolts leave a fire trail.' },
  fire_meteor: { 2: 'Calls a second meteor.', 3: 'Meteors leave a burning pool.' },
};

/** The draws behind `OFFER_GOLDEN`: cases, seeds 1 to 50, every spell casting, no level text. */
function replayGolden(): string[] {
  const shared = { actives: FIRE_CATALOG, casting: FIRE_CASTING, spellLevels: {} };
  const lines: string[] = [];
  const cases: [string, Loadout, number, Partial<OfferInput>][] = [
    ['fresh', buildLoadout('fire'), 1, {}],
    ['slot2', buildLoadout('fire'), SLOT_2_LEVEL, {}],
    ['full', fullLoadout(), PASSIVE_LEVEL, {}],
    ['capped', cappedLoadout(), PASSIVE_LEVEL, {}],
    [
      'banned',
      fullLoadout(),
      PASSIVE_LEVEL,
      { banned: new Set(['passive_magnet', 'passive_vitality']) },
    ],
    ['bannedActive', buildLoadout('fire'), SLOT_2_LEVEL, { banned: new Set(['fire_meteor']) }],
    [
      'exclude',
      fullLoadout(),
      PASSIVE_LEVEL,
      { exclude: new Set(['passive_magnet', 'passive_vitality', 'passive_haste']) },
    ],
  ];
  for (const [name, loadout, level, extra] of cases) {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const ids = levelUpOffer(rng, { loadout, level, ...shared, ...extra }).map((c) => c.id);
      lines.push(`${name}:${seed}:${ids.join(',')}|${rng.next()}`);
    }
  }
  for (const [name, loadout, level] of [
    ['banAfter', fullLoadout(), PASSIVE_LEVEL],
    ['banAfterActive', buildLoadout('fire'), SLOT_2_LEVEL],
  ] as const) {
    for (let seed = 1; seed <= 50; seed++) {
      const base: OfferInput = { loadout, level, ...shared };
      const shown = levelUpOffer(createRng(seed), base);
      const bannedId = shown[0]?.id as string;
      const rng = createRng(seed + 1000);
      const input = { ...base, banned: new Set([bannedId]) };
      const ids = offerAfterBan(rng, input, shown, bannedId).map((c) => c.id);
      lines.push(`${name}:${seed}:${ids.join(',')}|${rng.next()}`);
    }
  }
  return lines;
}

describe('levelUpOffer — seeds stay stable without spell levels (#326)', () => {
  it('replays the offers captured before upgrade cards, draw for draw', () => {
    expect(OFFER_GOLDEN).toHaveLength(450);
    expect(replayGolden()).toEqual(OFFER_GOLDEN);
  });

  it('adds nothing with the shipped, empty level table, whatever is casting', () => {
    const input: OfferInput = {
      loadout: fullLoadout(),
      level: PASSIVE_LEVEL,
      actives: FIRE_CATALOG,
      casting: FIRE_CASTING,
    };
    expect(offerPool(input)).toEqual(offerPool({ ...input, casting: undefined }));
    expect(offerPool(input).some((card) => card.kind === 'upgrade')).toBe(false);
  });
});

describe('levelUpOffer — spell upgrades in the passive pool (#326)', () => {
  const upgradeInput = (loadout = fullLoadout()): OfferInput => ({
    loadout,
    level: PASSIVE_LEVEL,
    actives: FIRE_CATALOG,
    casting: FIRE_CASTING,
    spellLevels: TABLE,
  });
  const upgradesOf = (cards: readonly OfferCard[]): OfferCard[] =>
    cards.filter((card) => card.kind === 'upgrade');

  it('offers an upgrade for each casting spell with level text, after the passives', () => {
    const pool = offerPool(upgradeInput());
    expect(upgradesOf(pool).map((card) => card.id)).toEqual([
      'spell_level_fire',
      'spell_level_fire_meteor',
    ]);
    const firstUpgrade = pool.findIndex((card) => card.kind === 'upgrade');
    expect(pool.slice(0, firstUpgrade).every((card) => card.kind === 'passive')).toBe(true);
  });

  it('builds the card for the level the pick grants, in the spell’s colour', () => {
    const [fire] = upgradesOf(offerPool(upgradeInput()));
    expect(fire).toEqual({
      kind: 'upgrade',
      id: 'spell_level_fire',
      name: 'Fire Bolt',
      description: 'Throws a second bolt.',
      rank: 2,
      maxRank: MAX_SPELL_LEVEL,
      color: 0xff5500,
    });
    const atTwo = upgradeSpell(fullLoadout(), 'fire');
    const [next] = upgradesOf(offerPool(upgradeInput(atTwo)));
    expect(next).toMatchObject({ rank: 3, maxRank: 3, description: 'Bolts leave a fire trail.' });
  });

  it('drops a spell at level 3, and every card is a valid card', () => {
    const atThree = upgradeSpell(upgradeSpell(fullLoadout(), 'fire'), 'fire');
    const pool = offerPool(upgradeInput(atThree));
    expect(upgradesOf(pool).map((card) => card.id)).toEqual(['spell_level_fire_meteor']);
    for (const card of offerPool(upgradeInput())) expect(isOfferCard(card), card.id).toBe(true);
  });

  it('offers no upgrade for a spell with no level text, or one that is not casting', () => {
    expect(upgradeableSpells(fullLoadout(), FIRE_CASTING, TABLE).map((s) => s.id)).toEqual([
      'fire',
      'fire_meteor',
    ]);
    const onlyColumn: SpellLevelTable = {
      fire_column: { 2: 'Raises a second column.', 3: 'Columns merge into one.' },
    };
    const casting = FIRE_CASTING.filter((spell) => spell.id !== 'fire_column');
    expect(upgradeableSpells(fullLoadout(), casting, onlyColumn)).toEqual([]);
  });

  it('never offers one while a slot has spells to fill it', () => {
    const input = { ...upgradeInput(buildLoadout('fire')), level: SLOT_2_LEVEL };
    expect(offerPool(input).every((card) => card.kind === 'active')).toBe(true);
  });

  it('offers one once no spell is left for the open slot', () => {
    const input = { ...upgradeInput(buildLoadout('fire')), level: SLOT_2_LEVEL, actives: [] };
    const kinds = new Set(offerPool(input).map((card) => card.kind));
    expect(kinds).toEqual(new Set(['passive', 'upgrade']));
  });

  it('draws upgrades into offers, seeded and replayable', () => {
    let seen = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const now = levelUpOffer(createRng(seed), upgradeInput());
      expect(levelUpOffer(createRng(seed), upgradeInput())).toEqual(now);
      expect(new Set(now.map((card) => card.id)).size).toBe(now.length);
      seen += upgradesOf(now).length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('never draws a banned upgrade, and offerAfterBan fills its place', () => {
    const banned = new Set(['spell_level_fire']);
    for (let seed = 1; seed <= 100; seed++) {
      const ids = levelUpOffer(createRng(seed), { ...upgradeInput(), banned }).map((c) => c.id);
      expect(ids, `seed ${seed}`).not.toContain('spell_level_fire');
    }
    const input = upgradeInput();
    const shown = [
      spellUpgradeCard(input.loadout, FIRE_CASTING[0] as ActiveCard, TABLE),
      ...levelUpOffer(createRng(3), input)
        .filter((card) => card.kind === 'passive')
        .slice(0, 2),
    ];
    const after = offerAfterBan(createRng(4), { ...input, banned }, shown, 'spell_level_fire');
    expect(after).toHaveLength(MAX_OFFER_SIZE);
    expect(after.map((card) => card.id)).not.toContain('spell_level_fire');
    expect(after[1]).toBe(shown[1]);
    expect(after[2]).toBe(shown[2]);
  });

  it('puts the upgrades just shown last in a reroll when the pool is short', () => {
    const passives: Passive[] = PASSIVES.slice(0, 2);
    const input = { ...upgradeInput(), passives, charges: [] };
    const pool = offerPool(input);
    const exclude = new Set(upgradesOf(pool).map((card) => card.id));
    const fresh = pool.filter((card) => !exclude.has(card.id)).map((card) => card.id);
    for (let seed = 1; seed <= 30; seed++) {
      const rerolled = levelUpOffer(createRng(seed), { ...input, exclude });
      expect(rerolled).toHaveLength(MAX_OFFER_SIZE);
      expect(
        rerolled
          .slice(0, 2)
          .map((card) => card.id)
          .sort(),
      ).toEqual(fresh.sort());
      expect(rerolled[2]?.kind).toBe('upgrade');
    }
  });

  it('offers upgrades alone once the passives are gone, and the +10 HP fallback once they are too', () => {
    const noPassives = { ...upgradeInput(), passives: [], charges: [] };
    const offer = levelUpOffer(createRng(1), noPassives);
    expect(offer.map((card) => card.kind)).toEqual(['upgrade', 'upgrade']);
    const atThree = (id: 'fire' | 'fire_meteor', loadout: Loadout): Loadout =>
      upgradeSpell(upgradeSpell(loadout, id), id);
    const spent = atThree('fire_meteor', atThree('fire', fullLoadout()));
    const none = levelUpOffer(createRng(1), { ...noPassives, loadout: spent });
    expect(none).toEqual([]);
    expect(resolveLevelUp(none).kind).toBe('fallback');
  });

  it('draws no more from the RNG than the pool it shuffles needs', () => {
    const rng = createRng(9);
    const twin = createRng(9);
    levelUpOffer(rng, upgradeInput());
    twin.shuffle(offerPool(upgradeInput()));
    expect(rng.next()).toBe(twin.next());
  });
});
