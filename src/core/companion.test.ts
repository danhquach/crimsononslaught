import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS } from '../config/colors';
import {
  BASE_COMPANION_STATS,
  COMPANION_FX,
  COMPANION_KINDS,
  COMPANION_SPELL_IDS,
} from '../config/companions';
import { ENEMY_ARCHETYPES } from '../config/enemies';
import { COMPANION_SHOT_GAP_PX } from '../config/fireLevels';
import { SPELL_LEVEL_STATS, type SpellLevel } from '../config/spellLevels';
import type { Vec2 } from './input';
import { levelStatAdds } from './spellLevelStats';
import {
  chooseTarget,
  companionEmpowerment,
  followVelocity,
  inReach,
  lungeVelocity,
  meleeTarget,
  spawnPosition,
  stepPosition,
  volleyLanes,
  type Bounds,
  type VolleyLane,
} from './companion';

/**
 * #133: what a companion does without an engine — where it walks, what it
 * picks, and whether it can reach it.
 *
 * `spells/CompanionSpell.ts` is the Phaser side and owns only the sprite and
 * the shot pool, so every rule the acceptance criteria name is checked here.
 */

const ARENA: Bounds = { left: 0, top: 0, right: 3000, bottom: 2000 };
const PLAYER = { x: 1000, y: 1000 };

describe('followVelocity', () => {
  it('stands still anywhere inside the leash', () => {
    for (const offset of [0, 10, 59.9]) {
      const pos = { x: PLAYER.x + offset, y: PLAYER.y };
      expect(followVelocity(pos, PLAYER, 60, 220), `${offset} px out`).toEqual({ x: 0, y: 0 });
    }
  });

  it('stands still exactly on the leash, so the edge reads as in range', () => {
    expect(followVelocity({ x: 1060, y: 1000 }, PLAYER, 60, 220)).toEqual({ x: 0, y: 0 });
  });

  it('walks straight back at chaseSpeed once it is outside', () => {
    const velocity = followVelocity({ x: 1200, y: 1000 }, PLAYER, 60, 220);
    expect(velocity).toEqual({ x: -220, y: 0 });
  });

  it('normalizes a diagonal return, so it is never faster than chaseSpeed', () => {
    const velocity = followVelocity({ x: 1300, y: 1300 }, PLAYER, 60, 220);
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(220, 10);
    expect(velocity.x).toBeCloseTo(velocity.y, 10);
  });

  it('is still when it is standing on the player, whatever the leash', () => {
    expect(followVelocity(PLAYER, PLAYER, 0, 220)).toEqual({ x: 0, y: 0 });
  });
});

describe('chooseTarget', () => {
  const enemies = [
    { x: 1400, y: 1000 },
    { x: 1100, y: 1000 },
    { x: 1250, y: 1000 },
  ];

  it('picks the nearest enemy to the companion, not to the player', () => {
    expect(chooseTarget({ x: 1390, y: 1000 }, enemies, 400)).toBe(enemies[0]);
    expect(chooseTarget({ x: 1000, y: 1000 }, enemies, 400)).toBe(enemies[1]);
  });

  it('picks nothing when everything is outside targetRange', () => {
    expect(chooseTarget(PLAYER, enemies, 50)).toBeUndefined();
  });

  it('counts an enemy exactly at targetRange as in range', () => {
    expect(chooseTarget(PLAYER, enemies, 100)).toBe(enemies[1]);
  });

  it('picks nothing out of an empty arena', () => {
    expect(chooseTarget(PLAYER, [], 400)).toBeUndefined();
  });

  it('breaks a tie on input order, so a seed reproduces the target', () => {
    const tied = [
      { x: 900, y: 1000 },
      { x: 1100, y: 1000 },
    ];
    expect(chooseTarget(PLAYER, tied, 400)).toBe(tied[0]);
    expect(chooseTarget(PLAYER, [...tied].reverse(), 400)).toBe(tied[1]);
  });
});

describe('meleeTarget', () => {
  it('picks the nearest enemy the ally may charge without leaving the leash', () => {
    const near = { x: 1100, y: 1000 };
    const outside = { x: 1400, y: 1000 };
    const pos = { x: 1200, y: 1000 };
    // `outside` is the nearer of the two to the ally, but 400 px from the
    // player: past the 220 px leash, so the ally goes for the one it may reach.
    expect(meleeTarget(pos, [outside, near], PLAYER, 200, 220)).toBe(near);
  });

  it('picks nothing when everything reachable is out of targetRange', () => {
    const inLeash = { x: 1200, y: 1000 };
    expect(meleeTarget(PLAYER, [inLeash], PLAYER, 100, 220)).toBeUndefined();
  });

  it('picks nothing when everything in targetRange is outside the leash', () => {
    const far = { x: 1300, y: 1000 };
    expect(meleeTarget({ x: 1200, y: 1000 }, [far], PLAYER, 200, 220)).toBeUndefined();
  });
});

describe('lungeVelocity', () => {
  it('charges the target it was given at chaseSpeed', () => {
    expect(lungeVelocity(PLAYER, { x: 1100, y: 1000 }, PLAYER, 220, 240)).toEqual({
      x: 240,
      y: 0,
    });
  });

  it('walks back when there is nothing to charge', () => {
    expect(lungeVelocity({ x: 1300, y: 1000 }, undefined, PLAYER, 220, 240)).toEqual({
      x: -240,
      y: 0,
    });
  });

  it('holds still with no target while it is inside its own leash', () => {
    expect(lungeVelocity({ x: 1100, y: 1000 }, undefined, PLAYER, 220, 240)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('never chases further out than the leash, however long the fight runs', () => {
    // Enemies strung out across the arena: only the one inside the leash is ever
    // charged, so the ally cannot be towed away from the player.
    const crowd = Array.from({ length: 12 }, (_, i) => ({ x: PLAYER.x + 200 + i * 120, y: 1000 }));
    let pos = { x: PLAYER.x, y: PLAYER.y };
    for (let i = 0; i < 600; i += 1) {
      const target = meleeTarget(pos, crowd, PLAYER, 200, 220);
      pos = stepPosition(pos, lungeVelocity(pos, target, PLAYER, 220, 240), 1 / 60, ARENA);
      expect(Math.hypot(pos.x - PLAYER.x, pos.y - PLAYER.y), `frame ${i}`).toBeLessThanOrEqual(
        220 + 1e-9,
      );
    }
  });
});

describe('inReach', () => {
  it('measures to the target edge, so a bigger enemy is hit from further out', () => {
    const target = { x: 1050, y: 1000 };
    expect(inReach(PLAYER, target, 16, 24)).toBe(false);
    expect(inReach(PLAYER, target, 32, 24)).toBe(true);
  });

  it('counts the exact edge of the reach as in reach', () => {
    expect(inReach(PLAYER, { x: 1040, y: 1000 }, 16, 24)).toBe(true);
  });
});

describe('stepPosition', () => {
  it('moves by velocity times the frame, so the same second covers the same ground', () => {
    const oneFrame = stepPosition(PLAYER, { x: 240, y: 0 }, 1, ARENA);
    let sixty = { x: PLAYER.x, y: PLAYER.y };
    for (let i = 0; i < 60; i += 1) sixty = stepPosition(sixty, { x: 240, y: 0 }, 1 / 60, ARENA);
    expect(sixty.x).toBeCloseTo(oneFrame.x, 9);
  });

  it('clamps to the arena rather than walking out of it', () => {
    expect(stepPosition({ x: 10, y: 10 }, { x: -600, y: -600 }, 1, ARENA)).toEqual({ x: 0, y: 0 });
    expect(stepPosition({ x: 2990, y: 1990 }, { x: 600, y: 600 }, 1, ARENA)).toEqual({
      x: 3000,
      y: 2000,
    });
  });

  it('leaves the ally where it stands on a zero-length or bad frame', () => {
    for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stepPosition(PLAYER, { x: 240, y: 0 }, delta, ARENA), `${delta}`).toEqual(PLAYER);
    }
  });

  it('returns a fresh point rather than mutating the one it was given', () => {
    const pos = { x: 1000, y: 1000 };
    const next = stepPosition(pos, { x: 240, y: 0 }, 1, ARENA);
    expect(pos).toEqual({ x: 1000, y: 1000 });
    expect(next).not.toBe(pos);
  });
});

describe('spawnPosition', () => {
  it('puts the ally inside its own leash from the first frame', () => {
    const pos = spawnPosition(PLAYER, 60);
    expect(followVelocity(pos, PLAYER, 60, 220)).toEqual({ x: 0, y: 0 });
  });
});

describe('volleyLanes (#327)', () => {
  const from = { x: 100, y: 100 };
  const target = { x: 400, y: 100 };

  /** Distance of `p` from the infinite line through `a` and `b`. */
  const lineDistance = (p: Vec2, a: Vec2, b: Vec2): number =>
    Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) /
    Math.hypot(b.x - a.x, b.y - a.y);

  it('is exactly the from and target it was given for one shot', () => {
    expect(volleyLanes(from, target, 1, 10)).toEqual([{ from, to: target }]);
  });

  it('runs two shots parallel to the line and symmetric about it', () => {
    const [a, b] = volleyLanes(from, target, 2, 10) as [VolleyLane, VolleyLane];
    for (const lane of [a, b]) {
      expect(lane.to.x - lane.from.x).toBeCloseTo(target.x - from.x, 9);
      expect(lane.to.y - lane.from.y).toBeCloseTo(target.y - from.y, 9);
      expect(lineDistance(lane.from, from, target)).toBeCloseTo(5, 9);
      expect(lineDistance(lane.to, from, target)).toBeCloseTo(5, 9);
    }
    expect(a.from.y - from.y).toBeCloseTo(-(b.from.y - from.y), 9);
    expect(a.from.y).not.toBeCloseTo(b.from.y, 3);
    expect(a.from.x).toBeCloseTo(b.from.x, 9);
  });

  it('puts the middle lane of three on the line', () => {
    const [, middle] = volleyLanes(from, target, 3, 10) as [VolleyLane, VolleyLane, VolleyLane];
    expect(middle.from.x).toBeCloseTo(from.x, 9);
    expect(middle.from.y).toBeCloseTo(from.y, 9);
    expect(middle.to.x).toBeCloseTo(target.x, 9);
    expect(middle.to.y).toBeCloseTo(target.y, 9);
  });

  it('keeps every configured lane within reach of a lone smallest enemy, at any range and heading', () => {
    // A lane hits when its offset from the target's centre is under the enemy's
    // radius plus the shot's own body radius; half that keeps the margin real.
    const smallestEnemy = Math.min(...Object.values(ENEMY_ARCHETYPES).map((e) => e.radius));
    const shots = Object.values(COMPANION_FX).flatMap((fx) => (fx.shot ? [fx.shot.texture] : []));
    const smallestShot = Math.min(...shots.map((texture) => PLACEHOLDERS[texture].width / 2));
    const bound = (smallestEnemy + smallestShot) / 2;
    const counts = COMPANION_SPELL_IDS.flatMap((id) => {
      if (COMPANION_KINDS[id] !== 'ranged') return [];
      const base = BASE_COMPANION_STATS[id].projectiles ?? 1;
      const add = levelStatAdds(SPELL_LEVEL_STATS, id, 3).projectiles ?? 0;
      return [Math.floor(base + add)];
    });
    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) {
      for (const [dx, dy] of [
        [300, 0],
        [0, -180],
        [-120, 90],
        [1, 1],
      ] as const) {
        const aim = { x: from.x + dx, y: from.y + dy };
        for (const lane of volleyLanes(from, aim, count, COMPANION_SHOT_GAP_PX)) {
          expect(lineDistance(lane.from, from, aim)).toBeLessThanOrEqual(bound + 1e-9);
          expect(lineDistance(lane.to, from, aim)).toBeLessThanOrEqual(bound + 1e-9);
        }
      }
    }
  });
});

describe('companionEmpowerment (#328)', () => {
  const LEVELS: readonly SpellLevel[] = [1, 2, 3];
  const attacks = [1, 2, 3, 4, 5, 6, 7, 8];
  const at = (id: (typeof COMPANION_SPELL_IDS)[number], level: SpellLevel): (string | null)[] =>
    attacks.map((n) => companionEmpowerment(id, n, level));

  it('empowers nothing below level 3', () => {
    for (const id of ['fire_companion', 'ice_companion'] as const) {
      for (const level of [1, 2] as const)
        expect(at(id, level), `${id} ${level}`).toEqual(attacks.map(() => null));
    }
  });

  it('makes every 4th attack of the Fire companion a fireball and of the Ice companion a frost orb at level 3', () => {
    const none = null;
    expect(at('fire_companion', 3)).toEqual([
      none,
      none,
      none,
      'fireball',
      none,
      none,
      none,
      'fireball',
    ]);
    expect(at('ice_companion', 3)).toEqual([
      none,
      none,
      none,
      'frostOrb',
      none,
      none,
      none,
      'frostOrb',
    ]);
  });

  it('empowers no attack of a companion with no empowered shot, at any level', () => {
    for (const id of ['lightning_companion', 'earth_companion'] as const) {
      for (const level of LEVELS)
        expect(at(id, level), `${id} ${level}`).toEqual(attacks.map(() => null));
    }
  });

  it('never counts attack 0 or a negative one', () => {
    expect(companionEmpowerment('ice_companion', 0, 3)).toBeNull();
    expect(companionEmpowerment('ice_companion', -4, 3)).toBeNull();
  });

  it('does not read an empowerment off the prototype chain', () => {
    expect(companionEmpowerment('toString' as never, 4, 3)).toBeNull();
    expect(companionEmpowerment('__proto__' as never, 4, 3)).toBeNull();
  });
});
