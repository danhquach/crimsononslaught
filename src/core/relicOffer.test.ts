import { describe, expect, it } from 'vitest';
import { PROFILE_CLAMPS } from '../config/passives';
import { RELIC_CHARGES } from '../config/offerActions';
import { RELIC_BUFFS, type RelicBuff, type RelicBuffId } from '../config/relics';
import { MAX_OFFER_SIZE, isOfferCard } from './levelUp';
import { levelUpOffer } from './levelUpOffer';
import { buildLoadout, profileOf, takePassive, takeRelic, type Loadout } from './loadout';
import { spendBan, startingActions } from './offerActions';
import { relicOffer, relicOfferAfterBan, weightedSample } from './relicOffer';
import { RELIC_OFFER_GOLDEN } from './relicOffer.golden';
import { createRng } from './rng';

const offerFor = (loadout: Loadout, seed = 1) =>
  relicOffer(createRng(seed), { ranks: loadout.relics, profile: profileOf(loadout) });

const buff = (id: string, weight: number, over: Partial<RelicBuff> = {}): RelicBuff => ({
  id,
  name: id,
  description: 'Does a thing.',
  field: 'damageMul',
  op: 'mul',
  amount: 1.1,
  weight,
  ...over,
});

describe('relicOffer (#227)', () => {
  it('offers 3 distinct cards, each a valid card, a buff at its next rank', () => {
    let loadout = buildLoadout('fire');
    loadout = takeRelic(takeRelic(loadout, 'relic_hourglass'), 'relic_hourglass');
    for (let seed = 1; seed <= 200; seed++) {
      const offer = offerFor(loadout, seed);
      expect(offer).toHaveLength(MAX_OFFER_SIZE);
      expect(new Set(offer.map((card) => card.id)).size, `seed ${seed}`).toBe(MAX_OFFER_SIZE);
      for (const card of offer) {
        expect(isOfferCard(card)).toBe(true);
        expect(['relic', 'charge']).toContain(card.kind);
        if (card.kind === 'relic') expect(card.rank).toBe(card.id === 'relic_hourglass' ? 3 : 1);
      }
    }
  });

  it('gives the same offers for the same seed', () => {
    const loadout = buildLoadout('fire');
    const draw = (seed: number) => {
      const rng = createRng(seed);
      const ranks = loadout.relics;
      const profile = profileOf(loadout);
      return [0, 1, 2].map(() => relicOffer(rng, { ranks, profile }).map((c) => c.id));
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it('never offers a buff whose stat is at its cap', () => {
    let loadout = buildLoadout('fire');
    for (let i = 0; i < 15; i++) loadout = takeRelic(loadout, 'relic_hourglass');
    for (let i = 0; i < 10; i++) loadout = takeRelic(loadout, 'relic_bulwark');
    for (let i = 0; i < 8; i++) loadout = takeRelic(loadout, 'relic_windstep');
    for (let i = 0; i < 11; i++) loadout = takeRelic(loadout, 'relic_hawk_eye');
    const capped = ['relic_hourglass', 'relic_bulwark', 'relic_windstep', 'relic_hawk_eye'];
    for (let seed = 1; seed <= 300; seed++) {
      for (const card of offerFor(loadout, seed)) expect(capped).not.toContain(card.id);
    }
  });

  it('counts passives towards the cap too', () => {
    let loadout = buildLoadout('fire');
    for (let i = 0; i < 8; i++) loadout = takePassive(loadout, 'passive_ward');
    // 8 Ward ranks are 32 %; 5 Bulwark ranks take it past the 60 % cap.
    for (let i = 0; i < 5; i++) loadout = takeRelic(loadout, 'relic_bulwark');
    expect(profileOf(loadout).damageReduction).toBe(PROFILE_CLAMPS.damageReduction?.max);
    for (let seed = 1; seed <= 300; seed++) {
      expect(offerFor(loadout, seed).map((c) => c.id)).not.toContain('relic_bulwark');
    }
  });

  it('shows what is left when fewer than 3 buffs can be offered', () => {
    const profile = profileOf(buildLoadout('fire'));
    const buffs = [buff('a', 1), buff('b', 1)];
    const offer = relicOffer(createRng(1), { ranks: new Map(), profile, buffs, charges: [] });
    expect(offer.map((c) => c.id).sort()).toEqual(['a', 'b']);
    const none = relicOffer(createRng(1), { ranks: new Map(), profile, buffs: [], charges: [] });
    expect(none).toEqual([]);
  });

  it('does not move the level-up offers of the same seed', () => {
    const plain = buildLoadout('fire');
    let withRelics = plain;
    for (const relic of RELIC_BUFFS) withRelics = takeRelic(withRelics, relic.id as RelicBuffId);
    const levelUps = (loadout: Loadout) =>
      levelUpOffer(createRng(7), { loadout, level: 1, actives: [] });
    expect(levelUps(withRelics)).toEqual(levelUps(plain));
  });
});

describe('relicOffer — reroll and ban charges (#228)', () => {
  const CHARGE_IDS = RELIC_CHARGES.map((c) => c.id);

  it('always has +2 Rerolls and +1 Ban in the pool, as charge cards', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const card of offerFor(buildLoadout('fire'), seed)) {
        if (card.kind === 'charge') seen.add(card.name);
      }
    }
    expect([...seen].sort()).toEqual(['+1 Ban', '+2 Rerolls']);
  });

  it('draws each at 0.4x a buff', () => {
    const profile = profileOf(buildLoadout('fire'));
    const buffs = [buff('a', 1), buff('b', 1)];
    const rng = createRng(5);
    const counts = new Map<string, number>();
    const draws = 20_000;
    for (let i = 0; i < draws; i++) {
      const [first] = relicOffer(rng, { ranks: new Map(), profile, buffs, size: 1 });
      counts.set(first?.id ?? '', (counts.get(first?.id ?? '') ?? 0) + 1);
    }
    const total = 2 + 0.4 * CHARGE_IDS.length;
    for (const id of CHARGE_IDS) expect((counts.get(id) ?? 0) / draws).toBeCloseTo(0.4 / total, 1);
    expect((counts.get('a') ?? 0) / draws).toBeCloseTo(1 / total, 1);
  });

  it('still offers them when every buff is at its cap', () => {
    const profile = profileOf(buildLoadout('fire'));
    const offer = relicOffer(createRng(1), { ranks: new Map(), profile, buffs: [] });
    expect(offer.map((c) => c.id).sort()).toEqual([...CHARGE_IDS].sort());
  });
});

describe('weightedSample', () => {
  it('draws in proportion to weight', () => {
    const rng = createRng(3);
    const counts = { heavy: 0, light: 0 };
    const items = ['heavy', 'light'] as const;
    const weight = (item: string) => (item === 'heavy' ? 1 : 0.4);
    const draws = 20_000;
    for (let i = 0; i < draws; i++) {
      const [first] = weightedSample(rng, items, weight, 1);
      counts[first as keyof typeof counts] += 1;
    }
    expect(counts.heavy / draws).toBeCloseTo(1 / 1.4, 1);
    expect(counts.light / draws).toBeCloseTo(0.4 / 1.4, 1);
  });

  it('never repeats an item, and never draws a weight of 0', () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const out = weightedSample(rng, ['a', 'b', 'c', 'd'], (x) => (x === 'd' ? 0 : 1), 4);
      expect(out.sort()).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('relicOffer requiresStat (#377)', () => {
  const pierceOnly = [buff('needs_pierce', 1, { requiresStat: 'pierce' })];
  const offer = (seed: number, carried?: ReadonlySet<'pierce' | 'damage'>) =>
    relicOffer(createRng(seed), {
      ranks: new Map(),
      profile: profileOf(buildLoadout('fire')),
      buffs: pierceOnly,
      carried,
    }).map((card) => card.id);

  it('never offers a buff that needs pierce without it carried', () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(offer(seed), `seed ${seed}`).not.toContain('needs_pierce');
      expect(offer(seed, new Set(['damage'])), `seed ${seed}`).not.toContain('needs_pierce');
    }
  });

  it('offers it once a casting spell carries pierce', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      for (const id of offer(seed, new Set(['pierce']))) seen.add(id);
    }
    expect(seen.has('needs_pierce')).toBe(true);
  });

  it('never offers the shipped Impaler when no carried set is passed', () => {
    const loadout = buildLoadout('fire');
    for (let seed = 1; seed <= 300; seed++) {
      expect(offerFor(loadout, seed).map((card) => card.id)).not.toContain('relic_impaler');
    }
  });
});

describe('relicOffer — Reroll, Skip and Ban (CO-239)', () => {
  const profile = profileOf(buildLoadout('fire'));
  const ids = (cards: readonly { id: string }[]) => cards.map((card) => card.id);

  it('draws the same offers from a seed as before, with no ban or reroll in play', () => {
    const fresh = buildLoadout('fire');
    let stacked = buildLoadout('ice');
    for (let i = 0; i < 15; i++) stacked = takeRelic(stacked, 'relic_hourglass');
    stacked = takeRelic(stacked, 'relic_bulwark');
    const lines: string[] = [];
    for (const [name, loadout] of [
      ['fresh', fresh],
      ['stacked', stacked],
    ] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const rng = createRng(seed);
        // An empty ban set and exclude, as Game passes them, draw like none at all.
        const input = {
          ranks: loadout.relics,
          profile: profileOf(loadout),
          banned: startingActions().banned,
          exclude: new Set<string>(),
        };
        const draws = [0, 1, 2].map(() =>
          relicOffer(rng, input)
            .map((card) => `${card.id}@${card.rank ?? ''}`)
            .join(','),
        );
        lines.push(`${name}:${seed}:${draws.join(';')}|${rng.next()}`);
      }
    }
    expect(lines).toEqual(RELIC_OFFER_GOLDEN);
  });

  it('never offers a banned buff or charge again that run', () => {
    let actions = spendBan(startingActions(), 'relic_lodestone');
    actions = actions && spendBan({ ...actions, bans: 1 }, 'charge_relic_ban');
    if (!actions) throw new Error('the bans were refused');
    for (let seed = 1; seed <= 300; seed++) {
      const offer = ids(
        relicOffer(createRng(seed), { ranks: new Map(), profile, banned: actions.banned }),
      );
      expect(offer, `seed ${seed}`).not.toContain('relic_lodestone');
      expect(offer, `seed ${seed}`).not.toContain('charge_relic_ban');
    }
  });

  it('offers a banned buff again on the next run', () => {
    const banned = spendBan(startingActions(), 'relic_lodestone');
    expect(banned?.banned.has('relic_lodestone')).toBe(true);
    const next = startingActions();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      for (const id of ids(
        relicOffer(createRng(seed), { ranks: new Map(), profile, banned: next.banned }),
      )) {
        seen.add(id);
      }
    }
    expect(seen.has('relic_lodestone')).toBe(true);
  });

  it('a reroll leaves out the cards just shown while the pool has others', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const shown = relicOffer(rng, { ranks: new Map(), profile });
      const exclude = new Set(ids(shown));
      const rerolled = relicOffer(rng, { ranks: new Map(), profile, exclude });
      expect(rerolled, `seed ${seed}`).toHaveLength(MAX_OFFER_SIZE);
      for (const id of ids(rerolled)) expect(exclude.has(id), `seed ${seed}`).toBe(false);
    }
  });

  it('a reroll of a short pool tops up from the cards just shown', () => {
    const buffs = [buff('a', 1), buff('b', 1), buff('c', 1), buff('d', 1)];
    const input = { ranks: new Map(), profile, buffs, charges: [] };
    const rerolled = relicOffer(createRng(4), { ...input, exclude: new Set(['a', 'b', 'c']) });
    expect(rerolled).toHaveLength(3);
    expect(rerolled[0]?.id, 'the one fresh card first').toBe('d');
    expect(new Set(ids(rerolled)).size, 'no card twice').toBe(3);
  });

  it('a ban redraws only the banned card, in its place', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const shown = relicOffer(rng, { ranks: new Map(), profile });
      const bannedId = shown[1]?.id ?? '';
      const banned = new Set([bannedId]);
      const after = relicOfferAfterBan(rng, { ranks: new Map(), profile, banned }, shown, bannedId);
      expect(after, `seed ${seed}`).toHaveLength(MAX_OFFER_SIZE);
      expect(after[0]).toEqual(shown[0]);
      expect(after[2]).toEqual(shown[2]);
      expect(ids(after)).not.toContain(bannedId);
      expect(new Set(ids(after)).size).toBe(MAX_OFFER_SIZE);
    }
  });

  it('a ban that empties the pool leaves what is left, or nothing', () => {
    const input = { ranks: new Map(), profile, buffs: [buff('a', 1), buff('b', 1)], charges: [] };
    const shown = relicOffer(createRng(1), input);
    const one = relicOfferAfterBan(createRng(2), { ...input, banned: new Set(['a']) }, shown, 'a');
    expect(ids(one)).toEqual(['b']);
    const none = relicOfferAfterBan(
      createRng(2),
      { ...input, banned: new Set(['a', 'b']) },
      one,
      'b',
    );
    expect(none).toEqual([]);
  });
});
