import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './animations';
import { ENEMY_ARCHETYPES, MAX_LIVE_ENEMIES } from './enemies';
import {
  AREA_ART_DEPTH,
  AREA_DEPTH,
  AREA_SCALE_RADIUS,
  ARENA_DEPTH,
  CHAIN_CLIP,
  CHAIN_FRAME_COUNT,
  CHAIN_FRAME_RATE,
  EXPLOSION_SCALE_RADIUS,
  LARGE_BURN_MIN_RADIUS,
  FX_ALPHA,
  DASH_DEPTH,
  BOSS_AURA_DEPTH,
  BOSS_CHAIN_FX,
  BOSS_TRAIL_DEPTH,
  BOSS_SLAM_FX,
  BOSS_SLAM_WARN_DEPTH,
  ELITE_MARK_DEPTH,
  FX_DEPTH,
  MAX_LIVE_AREAS,
  MAX_LIVE_FX,
  MAX_LIVE_OVERLAYS,
  MAX_LIVE_TELEGRAPHS,
  NOVA_SCALE_RADIUS,
  PROP_DEPTH,
  SPIN_BASE_ORBIT_SPEED,
  TELEGRAPH_SCALE_RADIUS,
} from './fx';
import { BOSS, BOSS_BOLT, BOSS_VOLLEY } from './boss';
import { PLACEHOLDERS } from './colors';
import { ART_BOXES } from './frames';
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
    // Earthquake's level 2 doubles a cast and the seismic patches share the
    // pool (#330), which `config/earthLevels.test.ts` sizes exactly.
    expect(MAX_LIVE_AREAS).toBeGreaterThanOrEqual(24);
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
    // #120: props lie on the floor, under ground areas and all the rest.
    expect(ARENA_DEPTH).toBeLessThan(PROP_DEPTH);
    expect(PROP_DEPTH).toBeLessThan(AREA_DEPTH);
    // #179: a patch's own art lies over the props and under its ring.
    expect(PROP_DEPTH).toBeLessThan(AREA_ART_DEPTH);
    expect(AREA_ART_DEPTH).toBeLessThan(AREA_DEPTH);
    // Entities are drawn at the default depth 0; effects sit above them.
    expect(AREA_DEPTH).toBeLessThan(0);
    expect(FX_DEPTH).toBeGreaterThan(0);
  });

  it('lays the dash trail just under the hero and over the ground (#384)', () => {
    expect(DASH_DEPTH).toBeLessThan(0);
    expect(DASH_DEPTH).toBeGreaterThan(AREA_DEPTH);
    expect(DASH_DEPTH).toBeGreaterThan(ELITE_MARK_DEPTH);
  });

  it('lays the enraged boss aura over the elite marks and under the entities (#388)', () => {
    expect(BOSS_AURA_DEPTH).toBeGreaterThan(ELITE_MARK_DEPTH);
    expect(BOSS_AURA_DEPTH).toBeLessThan(0);
  });

  it('reads the chain clip from the atlas animations', () => {
    const chain = ANIMATIONS.find((anim) => anim.name === CHAIN_CLIP);
    expect(chain).toBeDefined();
    expect(CHAIN_FRAME_COUNT).toBe(chain?.frames.length);
    expect(CHAIN_FRAME_RATE).toBe(chain?.frameRate);
  });

  it('draws only real clips, and each see-through but not faint (#347)', () => {
    const names = new Set(ANIMATIONS.map((anim) => anim.name));
    for (const [clip, alpha] of Object.entries(FX_ALPHA)) {
      expect(names.has(clip), clip).toBe(true);
      expect(alpha, clip).toBeGreaterThanOrEqual(0.6);
      expect(alpha, clip).toBeLessThan(1);
    }
  });
});

describe('Ground slam fx (CO-222)', () => {
  it('draws the warning rim round, so its scaled edge is the circular hit edge all the way round', () => {
    const { w, h } = ART_BOXES[BOSS_SLAM_FX.rim];
    expect(Math.abs(w - h)).toBeLessThanOrEqual(3);
  });

  it('lays the warning and the fire ring on the floor: over the enrage ring, under every entity', () => {
    expect(BOSS_SLAM_WARN_DEPTH).toBeGreaterThan(BOSS_AURA_DEPTH);
    expect(BOSS_SLAM_WARN_DEPTH).toBeLessThan(0);
  });
});

describe('Bolt volley fx (CO-223)', () => {
  it("draws the bolt's orb about as wide as its hit circle, and both clips exist", () => {
    const orb = ART_BOXES[BOSS_BOLT.clip].h;
    expect(orb).toBeGreaterThanOrEqual(BOSS_VOLLEY.boltRadius * 2 - 2);
    expect(orb).toBeLessThanOrEqual(BOSS_VOLLEY.boltRadius * 2 + 2);
    const names = new Set(ANIMATIONS.map((anim) => anim.name));
    expect(names.has(BOSS_BOLT.clip)).toBe(true);
    expect(names.has(BOSS_BOLT.hitClip)).toBe(true);
  });
});

describe('Boss summon art (CO-224)', () => {
  it('draws the circle about 44 px wide, with the burst on the same scale, and every clip exists', () => {
    const circle = ART_BOXES['boss.summonCircle'];
    expect(circle.w).toBeGreaterThanOrEqual(44);
    expect(circle.w).toBeLessThanOrEqual(50);
    expect(circle.h).toBeLessThan(circle.w);
    expect(ART_BOXES['boss.summonBurst'].w).toBeGreaterThanOrEqual(circle.w - 4);
    const names = new Set(ANIMATIONS.map((anim) => anim.name));
    for (const facing of ['down', 'up', 'left', 'right']) {
      expect(names.has(`boss.summonWindup.${facing}`)).toBe(true);
      expect(names.has(`boss.summon.${facing}`)).toBe(true);
    }
    expect(names.has('boss.summonCircle')).toBe(true);
    expect(names.has('boss.summonBurst')).toBe(true);
  });
});

describe('Boss chain charge art (CO-225)', () => {
  it('draws the trail long and thin, about its configured length, and both clips exist', () => {
    const trail = ART_BOXES[BOSS_CHAIN_FX.trail];
    expect(trail.w).toBeGreaterThanOrEqual(3 * trail.h);
    expect(trail.w).toBeGreaterThanOrEqual(BOSS_CHAIN_FX.trailLengthPx - 20);
    expect(trail.w).toBeLessThanOrEqual(BOSS_CHAIN_FX.trailLengthPx + 20);
    const names = new Set(ANIMATIONS.map((anim) => anim.name));
    expect(names.has(BOSS_CHAIN_FX.trail)).toBe(true);
    expect(names.has(BOSS_CHAIN_FX.flash)).toBe(true);
  });

  it('draws the glint roughly square, wider than the boss body', () => {
    const flash = ART_BOXES[BOSS_CHAIN_FX.flash];
    expect(Math.abs(flash.w - flash.h)).toBeLessThanOrEqual(0.2 * flash.w);
    expect(BOSS_CHAIN_FX.flashPx).toBeGreaterThan(BOSS.radius * 2);
  });

  it('lays the trail over the aura and slam warning, under the dash and every entity', () => {
    expect(BOSS_TRAIL_DEPTH).toBeGreaterThan(BOSS_AURA_DEPTH);
    expect(BOSS_TRAIL_DEPTH).toBeGreaterThan(BOSS_SLAM_WARN_DEPTH);
    expect(BOSS_TRAIL_DEPTH).toBeLessThan(DASH_DEPTH);
  });
});
