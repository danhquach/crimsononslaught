import { describe, expect, it } from 'vitest';
import {
  chooseTarget,
  followVelocity,
  inReach,
  lungeVelocity,
  meleeTarget,
  spawnPosition,
  stepPosition,
  type Bounds,
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
