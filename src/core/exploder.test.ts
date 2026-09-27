import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES, EXPLODER_BLAST } from '../config/enemies';
import { blastReaches } from './exploder';

describe('blastReaches', () => {
  it('reaches a player inside the radius, the edge included', () => {
    expect(blastReaches({ x: 0, y: 0 }, { x: 0, y: 0 }, 72)).toBe(true);
    expect(blastReaches({ x: 0, y: 0 }, { x: 30, y: 40 }, 50)).toBe(true);
    expect(blastReaches({ x: 10, y: 10 }, { x: 10, y: 82 }, 72)).toBe(true);
  });

  it('misses a player past it', () => {
    expect(blastReaches({ x: 0, y: 0 }, { x: 30, y: 40.01 }, 50)).toBe(false);
    expect(blastReaches({ x: 0, y: 0 }, { x: 500, y: 0 }, 72)).toBe(false);
  });
});

describe('the exploder tuning (#126)', () => {
  it('always catches the player it detonates on', () => {
    // Touching means the two bodies overlap, so the centres are closer than
    // both radii; the player's is 14 px (spec §5 placeholder).
    expect(EXPLODER_BLAST.radius).toBeGreaterThan(ENEMY_ARCHETYPES.exploder.radius + 14);
  });

  it('hits harder than its own contact would, and charges faster than the swarm', () => {
    expect(EXPLODER_BLAST.damage).toBeGreaterThan(ENEMY_ARCHETYPES.exploder.contactDamage);
    expect(ENEMY_ARCHETYPES.exploder.speed).toBeGreaterThan(ENEMY_ARCHETYPES.swarm.speed);
  });
});
