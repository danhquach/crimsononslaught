import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { ENEMY_ARCHETYPES, MAX_LIVE_ENEMIES } from './enemies';
import {
  CHAIN_CLIP,
  CHAIN_FRAME_COUNT,
  CHAIN_FRAME_RATE,
  EXPLOSION_SCALE_RADIUS,
  LARGE_BURN_MIN_RADIUS,
  MAX_LIVE_FX,
  MAX_LIVE_OVERLAYS,
  NOVA_SCALE_RADIUS,
  SPIN_BASE_ORBIT_SPEED,
} from './fx';
import { BASE_SPELL_STATS } from './spells';

describe('fx config (CO-082)', () => {
  it('scales the explosion and nova as the ticket states', () => {
    expect(EXPLOSION_SCALE_RADIUS).toBe(40);
    expect(NOVA_SCALE_RADIUS).toBe(90);
  });

  it('spins at the authored rate at the base orbit speed', () => {
    expect(SPIN_BASE_ORBIT_SPEED).toBe(BASE_SPELL_STATS.earth.orbitSpeed);
  });

  it('gives the tank and anything larger the big flame', () => {
    expect(LARGE_BURN_MIN_RADIUS).toBe(ENEMY_ARCHETYPES.tank.radius);
    expect(ENEMY_ARCHETYPES.swarm.radius).toBeLessThan(LARGE_BURN_MIN_RADIUS);
    expect(ENEMY_ARCHETYPES.fast.radius).toBeLessThan(LARGE_BURN_MIN_RADIUS);
  });

  it('caps overlays at the enemy pool size and bursts to a positive count', () => {
    expect(MAX_LIVE_OVERLAYS).toBe(MAX_LIVE_ENEMIES + 1);
    expect(MAX_LIVE_FX).toBeGreaterThan(0);
  });

  it('reads the chain clip from the atlas animations', () => {
    const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
    expect(chain).toBeDefined();
    expect(CHAIN_FRAME_COUNT).toBe(chain?.frames.length);
    expect(CHAIN_FRAME_RATE).toBe(chain?.frameRate);
  });
});
