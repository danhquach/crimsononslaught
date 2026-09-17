import { describe, expect, it } from 'vitest';
import { ENEMY_TYPES, isEnemyType } from './enemies';
import { BOSS_START_TIME, WAVES } from './waves';

describe('wave table', () => {
  it('matches the spec §5 spawn schedule', () => {
    expect(WAVES).toEqual([
      { startTime: 0, types: ['swarm'], spawnsPerSecond: 2 },
      { startTime: 60, types: ['swarm', 'fast'], spawnsPerSecond: 3 },
      { startTime: 120, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 4 },
      { startTime: 180, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 6 },
      { startTime: 240, types: ['swarm', 'fast', 'tank'], spawnsPerSecond: 8 },
      { startTime: 300, types: [], spawnsPerSecond: 0 },
    ]);
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

  it('ends with the silent boss wave at 5:00', () => {
    expect(BOSS_START_TIME).toBe(300);
    expect(WAVES.findIndex((wave) => wave.startTime === BOSS_START_TIME)).toBe(WAVES.length - 1);
    expect(WAVES.filter((wave) => wave.startTime === BOSS_START_TIME)).toEqual([
      { startTime: BOSS_START_TIME, types: [], spawnsPerSecond: 0 },
    ]);
  });
});
