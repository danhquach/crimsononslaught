import { describe, expect, it } from 'vitest';
import { CATACLYSM, EMBER } from '../config/fireLevels';
import type { SpellLevel } from '../config/spellLevels';
import {
  dragonHitsPerFlight,
  dragonStrike,
  emberDamage,
  emberLaunches,
  giantStrike,
  hasEmberSplit,
  isCataclysmCast,
  isEmpoweredAttack,
  waveFrontAngles,
  type StrikeShape,
} from './fireLevels';

/** #327: the level 3 rules of the Fire spells, checked without an engine. */

type Launch = { to: { x: number; y: number }; heading: number };
const LEVELS: readonly SpellLevel[] = [1, 2, 3];
const DEG = Math.PI / 180;

describe('level gates', () => {
  it('ember split is on from level 3 only', () => {
    expect(LEVELS.map(hasEmberSplit)).toEqual([false, false, true]);
  });

  it('cataclysm is every third cast, from level 3 only', () => {
    for (const level of [1, 2] as const) {
      for (let n = 1; n <= 9; n += 1)
        expect(isCataclysmCast(n, level), `${level}/${n}`).toBe(false);
    }
    const giant = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => isCataclysmCast(n, 3));
    expect(giant).toEqual([3, 6, 9]);
    expect(isCataclysmCast(0, 3)).toBe(false);
  });

  it('an empowered attack is every 4th, from level 3 only', () => {
    for (const level of [1, 2] as const) {
      for (let n = 1; n <= 8; n += 1) expect(isEmpoweredAttack(n, level, 4)).toBe(false);
    }
    const empowered = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => isEmpoweredAttack(n, 3, 4));
    expect(empowered).toEqual([4, 8]);
    expect(isEmpoweredAttack(0, 3, 4)).toBe(false);
  });

  it('a dragon strikes 1 enemy at levels 1 and 2 and 2 at level 3', () => {
    expect(LEVELS.map((level) => dragonHitsPerFlight(level))).toEqual([1, 1, 2]);
  });
});

describe('emberLaunches', () => {
  const centre = { x: 50, y: -20 };

  it('spaces the embers evenly, the first on the bolt heading, `range` out', () => {
    const heading = 0.7;
    const launches = emberLaunches(centre, heading, EMBER.count, EMBER.range) as [
      Launch,
      Launch,
      Launch,
    ];
    expect(launches).toHaveLength(EMBER.count);
    expect(launches[0].heading).toBeCloseTo(heading, 12);
    expect(launches[1].heading - launches[0].heading).toBeCloseTo((120 * Math.PI) / 180, 12);
    expect(launches[2].heading - launches[1].heading).toBeCloseTo((120 * Math.PI) / 180, 12);
    for (const { to } of launches) {
      expect(Math.hypot(to.x - centre.x, to.y - centre.y)).toBeCloseTo(EMBER.range, 9);
    }
    expect(launches[0].to.x).toBeCloseTo(centre.x + Math.cos(heading) * EMBER.range, 9);
  });

  it('deals a fraction of the bolt', () => {
    expect(emberDamage(10)).toBeCloseTo(10 * EMBER.damageFactor, 12);
    expect(emberDamage(10, 0.5)).toBe(5);
  });
});

describe('giantStrike', () => {
  const normal: StrikeShape = {
    radius: 70,
    blast: 60,
    pondRadius: 45,
    pondDuration: 1.5,
    pondTickDamage: 5,
    pondTickRate: 0.5,
  };

  it('doubles radius and blast and widens the pond, leaving its clock alone', () => {
    const giant = giantStrike(normal);
    expect(giant.radius).toBe(140);
    expect(giant.blast).toBe(120);
    expect(giant.pondRadius).toBeCloseTo(45 * CATACLYSM.pondRadiusMul, 12);
    expect(giant.pondDuration).toBe(1.5);
    expect(giant.pondTickDamage).toBe(5);
    expect(giant.pondTickRate).toBe(0.5);
  });

  it('does not change the strike it was given', () => {
    giantStrike(normal);
    expect(normal.radius).toBe(70);
  });
});

describe('waveFrontAngles', () => {
  it('is the heading alone while the art covers the arc', () => {
    expect(waveFrontAngles(0.4, 95)).toEqual([0.4]);
    expect(waveFrontAngles(0.4, 60)).toEqual([0.4]);
  });

  it('draws two fronts 55 degrees apart at 150, so the outer edges are 150 apart', () => {
    const [a, b] = waveFrontAngles(0.4, 150) as [number, number];
    expect(a).toBeCloseTo(0.4 - 27.5 * DEG, 12);
    expect(b).toBeCloseTo(0.4 + 27.5 * DEG, 12);
    expect(b + 47.5 * DEG - (a - 47.5 * DEG)).toBeCloseTo(150 * DEG, 12);
  });
});

describe('dragonStrike', () => {
  it('spends a one-strike dragon on its first enemy', () => {
    expect(dragonStrike(new Set<string>(), 0, 'a', 1)).toEqual({ strikes: true, spent: true });
  });

  it('keeps a two-strike dragon flying after the first, and spends it on the second', () => {
    expect(dragonStrike(new Set<string>(), 0, 'a', 2)).toEqual({ strikes: true, spent: false });
    expect(dragonStrike(new Set(['a']), 1, 'b', 2)).toEqual({ strikes: true, spent: true });
  });

  it('never strikes the same enemy twice, and stays unspent when it refuses', () => {
    expect(dragonStrike(new Set(['a']), 1, 'a', 2)).toEqual({ strikes: false, spent: false });
  });

  it('counts strikes made, not enemies still in the set, so a pruned set grants no extra hit', () => {
    // 'a' struck and left the crowd (pooled, so it may return): the set is empty
    // but the dragon has struck once; a new enemy is its second and last.
    expect(dragonStrike(new Set<string>(), 1, 'b', 2)).toEqual({ strikes: true, spent: true });
  });

  it('counts a missing or bad allowance as one strike', () => {
    for (const bad of [0, -3, NaN]) {
      expect(dragonStrike(new Set<string>(), 0, 'a', bad)).toEqual({ strikes: true, spent: true });
    }
  });
});
