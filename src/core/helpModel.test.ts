import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../config/animations';
import { TEXTURE_KEYS } from '../config/colors';
import { GEM_XP_VALUE } from '../config/gems';
import {
  BOMB_DAMAGE,
  BOSS_EMBERS,
  CHEST_EMBERS,
  EMBER_DROPS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  RELIC_COUNT,
} from '../config/pickups';
import { pickupHelpRows } from './helpModel';
import { MAX_OFFER_SIZE } from './levelUp';

const row = (name: string) => {
  const found = pickupHelpRows().find((r) => r.name === name);
  if (!found) throw new Error(`no ${name} row`);
  return found;
};

describe('pickupHelpRows', () => {
  it('lists the seven pickups in the ticket order', () => {
    expect(pickupHelpRows().map((r) => r.name)).toEqual([
      'XP gem',
      'Ember',
      'Health',
      'Magnet',
      'Bomb',
      'Chest',
      'Relic',
    ]);
  });

  it('gives every row an idle clip the atlas defines and a placeholder texture', () => {
    const clips = new Set(ANIMATIONS.map((anim) => anim.name));
    for (const r of pickupHelpRows()) {
      expect(clips).toContain(r.clip);
      expect(TEXTURE_KEYS).toContain(r.texture);
    }
  });

  it('reads every number from the config the pickups use', () => {
    expect(row('XP gem').effect).toContain(`${GEM_XP_VALUE} XP`);
    expect(row('Ember').source).toContain(`every tank kill (worth ${EMBER_DROPS.tank.value})`);
    expect(row('Ember').source).toContain(`${BOSS_EMBERS} from the boss`);
    expect(row('Health').effect).toContain(`${HEAL_AMOUNT} HP`);
    expect(row('Magnet').effect).toContain(`${MAGNET_DURATION_MS / 1000} s`);
    expect(row('Bomb').effect).toContain(`${BOMB_DAMAGE} damage`);
    expect(row('Chest').effect).toContain(`${CHEST_EMBERS} Embers`);
    expect(row('Relic').source).toContain(`${RELIC_COUNT} placed`);
    expect(row('Relic').effect).toContain(`1 of ${MAX_OFFER_SIZE}`);
  });

  it('names every enemy type that only sometimes drops an Ember', () => {
    const some = Object.entries(EMBER_DROPS).filter(([, drop]) => drop.chance < 1);
    for (const [type] of some) expect(row('Ember').source).toContain(type);
  });

  it('tells the magnet pickup apart from the Magnet passive', () => {
    expect(row('Magnet').effect).toContain('not the Magnet passive');
  });

  it('keeps each line short enough for one line of the 960 px screen', () => {
    for (const r of pickupHelpRows()) {
      expect(r.source.length).toBeLessThanOrEqual(90);
      expect(r.effect.length).toBeLessThanOrEqual(90);
    }
  });
});
