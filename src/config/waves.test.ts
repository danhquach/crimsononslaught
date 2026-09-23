import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES, isEnemyType } from './enemies';
import { BOSS_START_TIME, SPAWN_RING_MARGIN, WAVES } from './waves';

describe('wave table', () => {
  it('matches the 20-minute schedule (#127)', () => {
    const all = ['swarm', 'fast', 'tank'];
    expect(WAVES).toEqual([
      { startTime: 0, types: ['swarm'], spawnsPerSecond: 1.5, hpMul: 1, damageMul: 1 },
      { startTime: 120, types: ['swarm', 'fast'], spawnsPerSecond: 2, hpMul: 1.2, damageMul: 1.1 },
      { startTime: 240, types: all, spawnsPerSecond: 2.5, hpMul: 1.4, damageMul: 1.2 },
      { startTime: 360, types: all, spawnsPerSecond: 3, hpMul: 1.6, damageMul: 1.3 },
      { startTime: 480, types: all, spawnsPerSecond: 3.5, hpMul: 1.8, damageMul: 1.4 },
      { startTime: 600, types: all, spawnsPerSecond: 4, hpMul: 2, damageMul: 1.5 },
      { startTime: 720, types: all, spawnsPerSecond: 4.5, hpMul: 2.2, damageMul: 1.6 },
      { startTime: 840, types: all, spawnsPerSecond: 5, hpMul: 2.4, damageMul: 1.7 },
      { startTime: 960, types: all, spawnsPerSecond: 5.5, hpMul: 2.6, damageMul: 1.8 },
      { startTime: 1080, types: all, spawnsPerSecond: 6, hpMul: 2.8, damageMul: 1.9 },
      { startTime: 1200, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 },
    ]);
  });

  it('never eases off: rate and multipliers climb or hold until the boss', () => {
    const waves = WAVES.slice(0, -1);
    for (let i = 1; i < waves.length; i += 1) {
      const prev = waves[i - 1]!;
      const next = waves[i]!;
      const at = String(next.startTime);
      expect(next.spawnsPerSecond, at).toBeGreaterThanOrEqual(prev.spawnsPerSecond);
      expect(next.hpMul, at).toBeGreaterThanOrEqual(prev.hpMul);
      expect(next.damageMul, at).toBeGreaterThanOrEqual(prev.damageMul);
    }
  });

  it('scales by a positive multiplier on every row', () => {
    for (const wave of WAVES) {
      expect(wave.hpMul, String(wave.startTime)).toBeGreaterThan(0);
      expect(wave.damageMul, String(wave.startTime)).toBeGreaterThan(0);
    }
  });

  it('starts at 0 and has strictly ascending start times', () => {
    expect(WAVES[0].startTime).toBe(0);
    let previous = WAVES[0].startTime;
    for (const wave of WAVES.slice(1)) {
      expect(wave.startTime, String(wave.startTime)).toBeGreaterThan(previous);
      previous = wave.startTime;
    }
  });

  it('names only known enemy types and never repeats one in a wave', () => {
    for (const wave of WAVES) {
      for (const type of wave.types) expect(isEnemyType(type), type).toBe(true);
      expect(new Set(wave.types).size, String(wave.startTime)).toBe(wave.types.length);
    }
  });

  it('spawns at a non-negative rate, and only where there is something to spawn', () => {
    for (const wave of WAVES) {
      expect(wave.spawnsPerSecond, String(wave.startTime)).toBeGreaterThanOrEqual(0);
      expect(wave.spawnsPerSecond > 0, String(wave.startTime)).toBe(wave.types.length > 0);
    }
  });

  it('introduces every enemy type by the time the boss arrives', () => {
    const introduced = new Set(WAVES.flatMap((wave) => wave.types));
    expect([...introduced].sort()).toEqual([...ENEMY_TYPES].sort());
  });

  it('ends with the silent boss wave at 20:00', () => {
    expect(BOSS_START_TIME).toBe(1200);
    expect(WAVES.findIndex((wave) => wave.startTime === BOSS_START_TIME)).toBe(WAVES.length - 1);
    expect(WAVES.filter((wave) => wave.startTime === BOSS_START_TIME)).toEqual([
      { startTime: BOSS_START_TIME, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 },
    ]);
  });
});

describe('spawn ring margin', () => {
  it('is the spec §5 ring 100 px outside the camera view', () => {
    expect(SPAWN_RING_MARGIN).toBe(100);
  });
});
