import { describe, expect, it } from 'vitest';
import { SPELLS_BY_ELEMENT, isRosterSpellId, elementOf } from './loadout';
import { validateSpellFields } from '../core/playerProfile';
import { ANIMATIONS } from './animations';
import { TEXTURE_KEYS } from './colors';
import {
  BASE_COMPANION_STATS,
  COMPANION_CARDS,
  COMPANION_FX,
  COMPANION_KINDS,
  COMPANION_REACH,
  COMPANION_SPELL_IDS,
  MAX_COMPANION_SHOTS,
  isCompanionSpellId,
} from './companions';

/** #133: the companion rows are the spec's, and every one of them is castable. */

const CLIP_NAMES = new Set(ANIMATIONS.map((animation) => animation.name));

describe('companion ids', () => {
  it('names the one companion each element owns', () => {
    for (const id of COMPANION_SPELL_IDS) {
      expect(isRosterSpellId(id), id).toBe(true);
      expect(SPELLS_BY_ELEMENT[elementOf(id) ?? 'fire'], id).toContain(id);
    }
    expect(new Set(COMPANION_SPELL_IDS.map((id) => elementOf(id))).size).toBe(4);
  });

  it('recognizes its own ids and nothing else', () => {
    expect(COMPANION_SPELL_IDS.every(isCompanionSpellId)).toBe(true);
    for (const other of ['fire', 'earth_boulder', 'companion', '', 7, null]) {
      expect(isCompanionSpellId(other), `${String(other)}`).toBe(false);
    }
  });

  it('fields two ranged companions and two melee ones', () => {
    expect(COMPANION_KINDS.fire_companion).toBe('ranged');
    expect(COMPANION_KINDS.ice_companion).toBe('ranged');
    expect(COMPANION_KINDS.lightning_companion).toBe('melee');
    expect(COMPANION_KINDS.earth_companion).toBe('melee');
  });
});

describe('companion stat blocks', () => {
  it('gives every companion the fields the mechanic reads', () => {
    for (const id of COMPANION_SPELL_IDS) {
      const stats = BASE_COMPANION_STATS[id];
      expect(stats.attackCooldown, id).toBeGreaterThan(0);
      expect(stats.damage, id).toBeGreaterThan(0);
      expect(stats.targetRange, id).toBeGreaterThan(0);
      expect(stats.leashRadius, id).toBeGreaterThan(0);
      expect(stats.chaseSpeed, id).toBeGreaterThan(0);
    }
  });

  it('arms a ranged companion with shots and a melee one with none', () => {
    for (const id of COMPANION_SPELL_IDS) {
      const stats = BASE_COMPANION_STATS[id];
      const ranged = COMPANION_KINDS[id] === 'ranged';
      expect((stats.projectiles ?? 0) > 0, id).toBe(ranged);
      expect((stats.speed ?? 0) > 0, id).toBe(ranged);
    }
  });

  it('gives every companion an on-hit mark of its own element', () => {
    expect(BASE_COMPANION_STATS.fire_companion.burn).toBeGreaterThan(0);
    expect(BASE_COMPANION_STATS.ice_companion.slowPct).toBeGreaterThan(0);
    expect(BASE_COMPANION_STATS.lightning_companion.staggerDuration).toBeGreaterThan(0);
    expect(BASE_COMPANION_STATS.earth_companion.knockback).toBeGreaterThan(0);
  });

  it('burns for a positive window', () => {
    // `Enemy.applyBurn` takes a per-hit duration now (spec §9.2 Fire Column),
    // so a companion's own window no longer has to match the global default —
    // it only has to be a real, positive duration.
    expect(BASE_COMPANION_STATS.fire_companion.burnDuration).toBeGreaterThan(0);
  });

  it('lets a melee companion swing without leaving the player behind', () => {
    for (const id of COMPANION_SPELL_IDS) {
      if (COMPANION_KINDS[id] === 'ranged') continue;
      const { targetRange, leashRadius } = BASE_COMPANION_STATS[id];
      expect(targetRange, id).toBeLessThanOrEqual(leashRadius);
    }
  });

  it('routes every field through the category map, so passives reach them', () => {
    expect(validateSpellFields(BASE_COMPANION_STATS)).toEqual([]);
  });
});

describe('companion presentation', () => {
  it('gives every companion a card and a hit effect', () => {
    for (const id of COMPANION_SPELL_IDS) {
      expect(COMPANION_CARDS[id].name, id).not.toBe('');
      expect(COMPANION_CARDS[id].description, id).not.toContain('\n');
      expect(COMPANION_FX[id].hit, id).not.toBe('');
    }
  });

  it('gives a ranged companion a bolt of its own and a melee one none', () => {
    for (const id of COMPANION_SPELL_IDS) {
      const { shot } = COMPANION_FX[id];
      expect(shot !== undefined, id).toBe(COMPANION_KINDS[id] === 'ranged');
      if (shot) expect(TEXTURE_KEYS, `${id} shot`).toContain(shot.texture);
    }
  });

  it('never lets two companions fly the same bolt, so an element reads as itself', () => {
    const bolts = COMPANION_SPELL_IDS.map((id) => COMPANION_FX[id].shot?.texture).filter(Boolean);
    expect(new Set(bolts).size).toBe(bolts.length);
  });

  it('names clips the atlas actually carries', () => {
    for (const id of COMPANION_SPELL_IDS) {
      const { muzzle, hit, shot } = COMPANION_FX[id];
      expect(CLIP_NAMES, `${id} hit`).toContain(hit);
      if (muzzle) expect(CLIP_NAMES, `${id} muzzle`).toContain(muzzle);
      if (shot?.clip) expect(CLIP_NAMES, `${id} flight`).toContain(shot.clip);
    }
  });
});

describe('companion tunables', () => {
  it('reaches past an enemy rather than into it', () => {
    expect(COMPANION_REACH).toBeGreaterThan(0);
  });

  it('pools four times the shots a ranged companion keeps in the air', () => {
    // A bolt lives for range / speed seconds and one leaves every
    // `attackCooldown`, so that ratio is the steady count; the pool carries the
    // margin `companions.ts` promises for a build that raises either.
    for (const id of COMPANION_SPELL_IDS) {
      if (COMPANION_KINDS[id] !== 'ranged') continue;
      const { targetRange, speed = 1, attackCooldown } = BASE_COMPANION_STATS[id];
      const inFlight = targetRange / speed / attackCooldown;
      expect(MAX_COMPANION_SHOTS, id).toBeGreaterThanOrEqual(inFlight * 4);
    }
  });
});
