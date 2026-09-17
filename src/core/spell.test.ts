import { describe, expect, it } from 'vitest';
import { perkById } from '../config/perks';
import { RunState } from './runState';
import { CastScheduler, MAX_CASTS_PER_FRAME, Spell, nearestEnemies } from './spell';
import { createLoadout, type FireStats } from './spellStats';

/** The stub spell CO-043's acceptance criterion asks for: it only counts casts. */
class StubSpell extends Spell<'fire'> {
  casts = 0;
  /** Run-time seconds at each cast, so a test can check *when* it fired. */
  readonly castTimes: number[] = [];
  private elapsed = 0;

  constructor(stats: FireStats = createLoadout('fire').spell) {
    super('fire', stats);
  }

  protected override tick(deltaS: number): void {
    this.elapsed += deltaS;
    super.tick(deltaS);
  }

  protected cast(): void {
    this.casts += 1;
    this.castTimes.push(this.elapsed);
  }
}

/** A frame at 60 fps, the delta Phaser hands `update`. */
const FRAME_MS = 1000 / 60;

/**
 * Drive `spell` for `seconds` of *wall* time through a `RunState` at
 * `timeScale`, exactly as `GameScene.update` does: the scene delta is scaled
 * once by the run clock and the whole frame is simulated over the window.
 */
function runFor(spell: StubSpell, seconds: number, timeScale: number): void {
  const run = new RunState({ emit: () => true }, timeScale);
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let i = 0; i < frames; i += 1) spell.update(run.tick(FRAME_MS).deltaMs);
}

/**
 * Every cast landed on its own cooldown boundary, within the frame that crossed
 * it — a cast cannot happen mid-frame, and at timeScale 10 a frame is ten times
 * as much run time, so that quantum is the tolerance rather than a fixed epsilon.
 */
function expectCastsOnCooldown(spell: StubSpell, cooldown: number, timeScale: number): void {
  const frameS = (FRAME_MS / 1000) * timeScale;
  // The stub's own clock is a sum of float deltas, so a boundary it lands on
  // exactly can read a few ulps short; that slack is the test's, not the spell's.
  const epsilon = 1e-9;
  spell.castTimes.forEach((at, index) => {
    const boundary = (index + 1) * cooldown;
    expect(at - boundary).toBeGreaterThan(-epsilon);
    expect(at - boundary).toBeLessThan(frameS);
  });
}

describe('CastScheduler', () => {
  it('owes its first cast a full cooldown in, not on the first frame', () => {
    const scheduler = new CastScheduler();
    expect(scheduler.due(0.9, 1)).toBe(0);
    expect(scheduler.due(0.09, 1)).toBe(0);
    expect(scheduler.due(0.01, 1)).toBe(1);
  });

  it('carries the remainder, so casts do not drift on uneven frames', () => {
    const scheduler = new CastScheduler();
    expect(scheduler.due(0.7, 1)).toBe(0);
    expect(scheduler.due(0.7, 1)).toBe(1);
    expect(scheduler.pending).toBeCloseTo(0.4, 10);
  });

  it('pays out several casts when one frame covers several cooldowns', () => {
    expect(new CastScheduler().due(1, 0.25)).toBe(4);
  });

  it('caps a stalled frame and keeps only the remainder (no burst backlog)', () => {
    const scheduler = new CastScheduler();
    expect(scheduler.due(30, 1)).toBe(MAX_CASTS_PER_FRAME);
    expect(scheduler.pending).toBe(0);
  });

  it('uses the cooldown it is given now, so a perk shortens the current wait', () => {
    const scheduler = new CastScheduler();
    expect(scheduler.due(0.8, 1.2)).toBe(0);
    // A Utility rank lands here: 0.8 s of charge already clears the new cooldown.
    expect(scheduler.due(0, 0.75)).toBe(1);
  });

  it('ignores junk deltas and never fires without a usable cooldown', () => {
    const scheduler = new CastScheduler();
    expect(scheduler.due(-5, 1)).toBe(0);
    expect(scheduler.due(Number.NaN, 1)).toBe(0);
    expect(scheduler.pending).toBe(0);
    expect(scheduler.due(10, 0)).toBe(0);
    expect(scheduler.due(10, Infinity)).toBe(0);
  });

  it('resets to a full cooldown from now', () => {
    const scheduler = new CastScheduler();
    scheduler.due(0.9, 1);
    scheduler.reset();
    expect(scheduler.pending).toBe(0);
    expect(scheduler.due(0.9, 1)).toBe(0);
  });
});

describe('nearestEnemies', () => {
  const origin = { x: 0, y: 0 };
  const near = { x: 10, y: 0 };
  const mid = { x: 0, y: 50 };
  const far = { x: 300, y: 0 };

  it('returns the closest candidates, nearest first', () => {
    expect(nearestEnemies(origin, [far, near, mid], 2)).toEqual([near, mid]);
  });

  it('returns everything in range when fewer than asked for', () => {
    expect(nearestEnemies(origin, [near], 3)).toEqual([near]);
    expect(nearestEnemies(origin, [], 3)).toEqual([]);
  });

  it('measures true distance, not per-axis', () => {
    const diagonal = { x: 40, y: 40 };
    expect(nearestEnemies(origin, [diagonal, mid], 1)).toEqual([mid]);
  });

  it('drops anything past maxRange and keeps the range itself', () => {
    expect(nearestEnemies(origin, [far, near], 3, 100)).toEqual([near]);
    expect(nearestEnemies(origin, [{ x: 100, y: 0 }], 1, 100)).toHaveLength(1);
    expect(nearestEnemies(origin, [{ x: 100.01, y: 0 }], 1, 100)).toEqual([]);
  });

  it('breaks ties by input order, so a cast is reproducible without the rng', () => {
    const left = { x: -25, y: 0 };
    const right = { x: 25, y: 0 };
    expect(nearestEnemies(origin, [left, right], 1)).toEqual([left]);
    expect(nearestEnemies(origin, [right, left], 1)).toEqual([right]);
  });

  it('asks for nothing and gets nothing', () => {
    expect(nearestEnemies(origin, [near], 0)).toEqual([]);
    expect(nearestEnemies(origin, [near], -1)).toEqual([]);
  });
});

describe('Spell', () => {
  it('fires exactly on cooldown at timeScale 1 (CO-043)', () => {
    const spell = new StubSpell();
    const { cooldown } = spell.stats;

    runFor(spell, 12, 1);

    // 12 s of run time at a 1.2 s cooldown: 10 casts, one per cooldown boundary.
    expect(spell.casts).toBe(10);
    expectCastsOnCooldown(spell, cooldown, 1);
  });

  it('fires exactly on cooldown at timeScale 10 (CO-043)', () => {
    const spell = new StubSpell();
    const { cooldown } = spell.stats;

    // A tenth of the wall time covers the same 12 s of run time.
    runFor(spell, 1.2, 10);

    expect(spell.casts).toBe(10);
    expectCastsOnCooldown(spell, cooldown, 10);
  });

  it('is the same run at either scale', () => {
    const real = new StubSpell();
    const fast = new StubSpell();
    runFor(real, 12, 1);
    runFor(fast, 1.2, 10);
    expect(fast.casts).toBe(real.casts);
  });

  it('reports the wait until the next cast', () => {
    const spell = new StubSpell();
    expect(spell.timeToNextCast).toBeCloseTo(1.2, 10);
    spell.update(600);
    expect(spell.timeToNextCast).toBeCloseTo(0.6, 10);
  });

  it('copies the stats it is handed, so the loadout cannot be changed through it', () => {
    const loadout = createLoadout('fire');
    const spell = new StubSpell(loadout.spell);
    spell.applyPerk('fire_power_damage', 1);
    expect(spell.stats.damage).toBe(loadout.spell.damage + 4);
    expect(loadout.spell.damage).toBe(12);
  });

  it('applies a spell perk to its own block', () => {
    const spell = new StubSpell();
    spell.applyPerk('fire_reach_blast', 1);
    spell.applyPerk('fire_reach_blast', 2);
    expect(spell.stats.aoeRadius).toBe(40 + 24);
  });

  it('takes a generic perk without changing a spell stat', () => {
    const spell = new StubSpell();
    const before = { ...spell.stats };
    spell.applyPerk('generic_move_speed', 1);
    expect(spell.stats).toEqual(before);
  });

  it('rejects a perk this spell cannot have', () => {
    const spell = new StubSpell();
    expect(() => spell.applyPerk('ice_power_damage', 1)).toThrow(/belongs to ice/);
    expect(() => spell.applyPerk('nope', 1)).toThrow(/unknown perk/);
    expect(() => spell.applyPerk('fire_power_damage', 4)).toThrow(RangeError);
  });

  it('shortens the wait the player is already in when a cooldown perk lands', () => {
    const spell = new StubSpell();
    // 1 s into a 1.2 s cooldown, two Utility ranks cut it below the charge held.
    spell.update(1000);
    expect(spell.casts).toBe(0);
    spell.applyPerk('fire_utility_cooldown', 1);
    spell.applyPerk('fire_utility_cooldown', 2);
    const cut = perkById('fire_utility_cooldown')?.effect.amount ?? 1;
    expect(spell.stats.cooldown).toBeCloseTo(1.2 * cut ** 2, 10);
    spell.update(0);
    expect(spell.casts).toBe(1);
  });

  it('takes a whole block from the perk system', () => {
    const spell = new StubSpell();
    const loadout = createLoadout('fire');
    loadout.spell.damage = 99;
    spell.setStats(loadout.spell);
    expect(spell.stats.damage).toBe(99);
    loadout.spell.damage = 1;
    expect(spell.stats.damage).toBe(99);
  });
});
