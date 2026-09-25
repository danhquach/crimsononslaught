import { describe, expect, it } from 'vitest';
import { BASE_PLAYER_PROFILE, PROFILE_CLAMPS, type PlayerProfile } from '../config/passives';
import { RELIC_BUFFS, type RelicBuff, type RelicBuffId } from '../config/relics';
import { MAX_OFFER_SIZE, isOfferCard } from './levelUp';
import { levelUpOffer } from './levelUpOffer';
import { buildLoadout, profileOf, takePassive, takeRelic, type Loadout } from './loadout';
import { atCap, relicOffer, weightedSample } from './relicOffer';
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
  it('offers 3 distinct relic buffs, each a valid card at its next rank', () => {
    let loadout = buildLoadout('fire');
    loadout = takeRelic(takeRelic(loadout, 'relic_hourglass'), 'relic_hourglass');
    for (let seed = 1; seed <= 200; seed++) {
      const offer = offerFor(loadout, seed);
      expect(offer).toHaveLength(MAX_OFFER_SIZE);
      expect(new Set(offer.map((card) => card.id)).size, `seed ${seed}`).toBe(MAX_OFFER_SIZE);
      for (const card of offer) {
        expect(isOfferCard(card)).toBe(true);
        expect(card.kind).toBe('relic');
        expect(card.rank).toBe(card.id === 'relic_hourglass' ? 3 : 1);
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
    const offer = relicOffer(createRng(1), { ranks: new Map(), profile, buffs });
    expect(offer.map((c) => c.id).sort()).toEqual(['a', 'b']);
    const none = relicOffer(createRng(1), { ranks: new Map(), profile, buffs: [] });
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

describe('atCap', () => {
  const at = (over: Partial<PlayerProfile>): PlayerProfile => ({ ...BASE_PLAYER_PROFILE, ...over });

  it('reads the clamp in the direction the buff moves its field', () => {
    const hourglass = RELIC_BUFFS.find((b) => b.id === 'relic_hourglass') as RelicBuff;
    const windstep = RELIC_BUFFS.find((b) => b.id === 'relic_windstep') as RelicBuff;
    expect(atCap(hourglass, at({ cooldownMul: 0.35 }))).toBe(true);
    expect(atCap(hourglass, at({ cooldownMul: 0.36 }))).toBe(false);
    expect(atCap(windstep, at({ moveSpeed: 320 }))).toBe(true);
    expect(atCap(windstep, at({ moveSpeed: 319 }))).toBe(false);
  });

  it('never caps a field with no clamp', () => {
    const fury = RELIC_BUFFS.find((b) => b.id === 'relic_ancient_fury') as RelicBuff;
    expect(atCap(fury, at({ damageMul: 1e6 }))).toBe(false);
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
