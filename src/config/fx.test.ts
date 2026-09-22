import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { ENEMY_ARCHETYPES, MAX_LIVE_ENEMIES } from './enemies';
import {
  AREA_DEPTH,
  AREA_SCALE_RADIUS,
  ARENA_DEPTH,
  CHAIN_CLIP,
  CHAIN_FRAME_COUNT,
  CHAIN_FRAME_RATE,
  EXPLOSION_SCALE_RADIUS,
  LARGE_BURN_MIN_RADIUS,
  FX_DEPTH,
  MAX_LIVE_AREAS,
  MAX_LIVE_FX,
  MAX_LIVE_OVERLAYS,
  MAX_LIVE_TELEGRAPHS,
  NOVA_SCALE_RADIUS,
  SPIN_BASE_ORBIT_SPEED,
  TELEGRAPH_SCALE_RADIUS,
} from './fx';
import { PLACEHOLDERS } from './colors';
import { BASE_EARTH_SHIELD_STATS } from './shields';

describe('fx config (CO-082)', () => {
  it('scales the explosion and nova as the ticket states', () => {
    expect(EXPLOSION_SCALE_RADIUS).toBe(40);
    expect(NOVA_SCALE_RADIUS).toBe(90);
  });

  it('spins at the authored rate at the base orbit speed', () => {
    expect(SPIN_BASE_ORBIT_SPEED).toBe(BASE_EARTH_SHIELD_STATS.orbitSpeed);
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

  it('caps ground areas well above what a run can hold', () => {
    // Two area spells (only `?loadout=` equips both), two patches each at a
    // fully hasted cooldown: the cap is four times the reachable peak (#135).
    expect(MAX_LIVE_AREAS).toBeGreaterThanOrEqual(16);
  });

  it('scales a ground area against the placeholder it is drawn with', () => {
    // `areaScale` is radius / AREA_SCALE_RADIUS, so the texture must be twice
    // that wide or the ring would not outline the patch that ticks.
    expect(PLACEHOLDERS.fx_area.width).toBe(AREA_SCALE_RADIUS * 2);
    expect(PLACEHOLDERS.fx_area.height).toBe(PLACEHOLDERS.fx_area.width);
  });

  it('caps telegraphs above what a run can hold and scales them against their ring', () => {
    // One strike spell, one 1 s fall against a 4 s cooldown (#138): the cap is
    // several times the reachable peak.
    expect(MAX_LIVE_TELEGRAPHS).toBeGreaterThanOrEqual(8);
    expect(PLACEHOLDERS.fx_telegraph.width).toBe(TELEGRAPH_SCALE_RADIUS * 2);
    expect(PLACEHOLDERS.fx_telegraph.height).toBe(PLACEHOLDERS.fx_telegraph.width);
  });

  it('lays a ground area on the arena floor and under the crowd', () => {
    expect(ARENA_DEPTH).toBeLessThan(AREA_DEPTH);
    // Entities are drawn at the default depth 0; effects sit above them.
    expect(AREA_DEPTH).toBeLessThan(0);
    expect(FX_DEPTH).toBeGreaterThan(0);
  });

  it('reads the chain clip from the atlas animations', () => {
    const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
    expect(chain).toBeDefined();
    expect(CHAIN_FRAME_COUNT).toBe(chain?.frames.length);
    expect(CHAIN_FRAME_RATE).toBe(chain?.frameRate);
  });
});
