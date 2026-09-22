import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../config/animations';
import { ENEMY_ARCHETYPES } from '../config/enemies';
import { BASE_SPELL_STATS } from '../config/spells';
import { BASE_AREA_STATS } from '../config/areas';
import { BASE_METEOR_STATS } from '../config/strikes';
import {
  CHAIN_CYCLE_MS,
  areaScale,
  chainFrame,
  chainSegmentPose,
  dustFlip,
  explosionScale,
  flightRotation,
  novaScale,
  spinTimeScale,
  statusOverlay,
  telegraphScale,
  type EnemyStatus,
} from './fx';

const NAMES = new Set(ANIMATIONS.map((anim) => anim.name));

const idle: EnemyStatus = {
  burning: false,
  slowed: false,
  frozen: false,
  stunned: false,
  staggered: false,
  bleeding: false,
  radius: ENEMY_ARCHETYPES.swarm.radius,
};

describe('effect scales (CO-082)', () => {
  it('draws the explosion at aoeRadius / 40', () => {
    expect(explosionScale(40)).toBe(1);
    expect(explosionScale(BASE_SPELL_STATS.fire.aoeRadius)).toBeCloseTo(1.25);
  });

  it('draws the nova at radius / 90', () => {
    expect(novaScale(90)).toBe(1);
    expect(novaScale(180)).toBe(2);
  });

  it('draws a ground area at radius / 100, so the ring is the patch', () => {
    expect(areaScale(100)).toBe(1);
    expect(areaScale(BASE_AREA_STATS.ice_blizzard.radius)).toBeCloseTo(1.8);
    // A block with no radius draws nothing rather than a mirrored ring.
    expect(areaScale(-50)).toBe(0);
  });

  it('draws a telegraph at radius / 100, so the ring is the blast to come', () => {
    expect(telegraphScale(100)).toBe(1);
    expect(telegraphScale(BASE_METEOR_STATS.aoeRadius)).toBeCloseTo(1.1);
    expect(telegraphScale(-50)).toBe(0);
  });

  it('spins at the authored rate at the base orbit speed and in proportion above it', () => {
    const base = BASE_SPELL_STATS.earth.orbitSpeed;
    expect(spinTimeScale(base)).toBe(1);
    expect(spinTimeScale(base * 2)).toBe(2);
    expect(spinTimeScale(0)).toBe(0);
    expect(spinTimeScale(-1)).toBe(0);
  });
});

describe('flightRotation', () => {
  it('turns art drawn facing right along the velocity', () => {
    expect(flightRotation({ x: 1, y: 0 }, 9)).toBe(0);
    expect(flightRotation({ x: 0, y: 1 }, 9)).toBeCloseTo(Math.PI / 2);
    expect(flightRotation({ x: -1, y: 0 }, 9)).toBeCloseTo(Math.PI);
  });

  it('holds the heading when stopped', () => {
    expect(flightRotation({ x: 0, y: 0 }, 1.5)).toBe(1.5);
  });
});

describe('dustFlip', () => {
  it('mirrors the dust for a push to the left only', () => {
    expect(dustFlip({ x: -10, y: 0 })).toBe(true);
    expect(dustFlip({ x: 10, y: 0 })).toBe(false);
    expect(dustFlip({ x: 0, y: 30 })).toBe(false);
  });
});

describe('statusOverlay', () => {
  it('shows nothing for a free enemy', () => {
    expect(statusOverlay(idle)).toBeNull();
  });

  it('names an atlas clip for every status', () => {
    const cases: Partial<EnemyStatus>[] = [
      { burning: true },
      { burning: true, radius: ENEMY_ARCHETYPES.tank.radius },
      { slowed: true },
      { frozen: true, slowed: true },
      { stunned: true },
      { staggered: true },
      { bleeding: true },
      { bleeding: true, radius: ENEMY_ARCHETYPES.tank.radius },
    ];
    for (const status of cases) {
      const clip = statusOverlay({ ...idle, ...status });
      expect(clip, JSON.stringify(status)).not.toBeNull();
      expect(NAMES.has(clip ?? ''), `${clip} is an atlas animation`).toBe(true);
    }
  });

  it('gives the small flame to swarm and fast, the big one to the tank and boss', () => {
    expect(statusOverlay({ ...idle, burning: true })).toBe('fire.burn');
    expect(statusOverlay({ ...idle, burning: true, radius: ENEMY_ARCHETYPES.fast.radius })).toBe(
      'fire.burn',
    );
    expect(statusOverlay({ ...idle, burning: true, radius: ENEMY_ARCHETYPES.tank.radius })).toBe(
      'fire.burnBig',
    );
    expect(statusOverlay({ ...idle, burning: true, radius: 40 })).toBe('fire.burnBig');
  });

  it('covers a slow with the freeze block and lets a stun outrank a slow', () => {
    expect(statusOverlay({ ...idle, slowed: true })).toBe('ice.slow');
    expect(statusOverlay({ ...idle, slowed: true, frozen: true })).toBe('ice.freeze');
    expect(statusOverlay({ ...idle, slowed: true, stunned: true })).toBe('lightning.stun');
  });

  // #139: the new statuses rank under their nearest kin and borrow its clip until #145.
  it('ranks a stagger as a stop — over a slow and a bleed — and a bleed under everything', () => {
    expect(statusOverlay({ ...idle, staggered: true })).toBe('lightning.stun');
    expect(statusOverlay({ ...idle, staggered: true, slowed: true })).toBe('lightning.stun');
    expect(statusOverlay({ ...idle, staggered: true, bleeding: true })).toBe('lightning.stun');
    expect(statusOverlay({ ...idle, staggered: true, frozen: true })).toBe('ice.freeze');
    expect(statusOverlay({ ...idle, bleeding: true })).toBe('fire.burn');
    expect(statusOverlay({ ...idle, bleeding: true, radius: ENEMY_ARCHETYPES.tank.radius })).toBe(
      'fire.burnBig',
    );
    expect(statusOverlay({ ...idle, bleeding: true, slowed: true })).toBe('ice.slow');
    expect(statusOverlay({ ...idle, bleeding: true, burning: true })).toBe('fire.burn');
  });
});

describe('chainSegmentPose', () => {
  it('anchors at the first enemy, spans to the second and turns along the line', () => {
    const pose = chainSegmentPose({ x: 10, y: 20 }, { x: 40, y: 60 });
    expect(pose.x).toBe(10);
    expect(pose.y).toBe(20);
    expect(pose.length).toBe(50);
    expect(pose.rotation).toBeCloseTo(Math.atan2(40, 30));
  });

  it('has no length between two enemies on the same spot', () => {
    expect(chainSegmentPose({ x: 5, y: 5 }, { x: 5, y: 5 }).length).toBe(0);
  });
});

describe('chainFrame', () => {
  const chain = ANIMATIONS.find((anim) => anim.name === 'lightning.chain');
  const count = chain?.frames.length ?? 0;
  const frameMs = 1000 / (chain?.frameRate ?? 1);

  it('cycles once through the clip on the run clock', () => {
    expect(CHAIN_CYCLE_MS).toBeCloseTo(count * frameMs);
    expect(chainFrame(0)).toBe(0);
    expect(chainFrame(frameMs * 1.5)).toBe(1);
    expect(chainFrame(CHAIN_CYCLE_MS - 1)).toBe(count - 1);
  });

  it('is over once the cycle has played, and never before it started', () => {
    expect(chainFrame(CHAIN_CYCLE_MS)).toBeNull();
    expect(chainFrame(CHAIN_CYCLE_MS * 3)).toBeNull();
    expect(chainFrame(-1)).toBeNull();
    expect(chainFrame(Number.NaN)).toBeNull();
  });
});
