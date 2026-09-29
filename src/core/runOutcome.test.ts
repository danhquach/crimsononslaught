import { describe, expect, it } from 'vitest';
import { decideOnBossKill, heroHurtable, settleOutcome, type DecidedOutcome } from './runOutcome';

const HERO_CLIP_MS = 750;
const BOSS_CLIP_MS = 1000;

/**
 * Plays a close death on a millisecond timeline with the same three calls
 * `GameScene` makes: the boss's killing blow decides, a hit on the hero is
 * dropped once a win is decided, and the first death event to fire asks
 * `settleOutcome` for the record. `heroHitAtMs` is when a lethal hit reaches
 * the hero; `bossBlowAtMs` when the boss takes its killing blow.
 */
function record(bossBlowAtMs: number, heroHitAtMs: number): string {
  let decided: DecidedOutcome | undefined;
  let heroDeadAtMs: number | undefined;
  const heroHit = (): void => {
    if (heroHurtable(decided) && heroDeadAtMs === undefined) heroDeadAtMs = heroHitAtMs;
  };
  // A tie goes to the blow, the way the scene's step order does: the hit that
  // shares its frame with the killing blow lands after it.
  if (bossBlowAtMs <= heroHitAtMs) {
    decided = decideOnBossKill(decided, false);
    heroHit();
  } else {
    heroHit();
    decided = decideOnBossKill(decided, heroDeadAtMs !== undefined);
  }
  const bossEventAtMs = bossBlowAtMs + BOSS_CLIP_MS;
  const heroEventAtMs = heroDeadAtMs === undefined ? Infinity : heroDeadAtMs + HERO_CLIP_MS;
  return heroEventAtMs < bossEventAtMs
    ? settleOutcome(decided, 'lose')
    : settleOutcome(decided, 'win');
}

describe('decideOnBossKill (#315)', () => {
  it('is a win while the hero has HP, a loss once the hero is dead', () => {
    expect(decideOnBossKill(undefined, false)).toBe('win');
    expect(decideOnBossKill(undefined, true)).toBe('lose');
  });

  it('keeps the first decision', () => {
    expect(decideOnBossKill('win', true)).toBe('win');
    expect(decideOnBossKill('lose', false)).toBe('lose');
  });
});

describe('heroHurtable (#315)', () => {
  it('is false only once a win is decided', () => {
    expect(heroHurtable(undefined)).toBe(true);
    expect(heroHurtable('lose')).toBe(true);
    expect(heroHurtable('win')).toBe(false);
  });
});

describe('settleOutcome (#315)', () => {
  it('records the decision over whatever asked, and the request when nothing is decided', () => {
    expect(settleOutcome('win', 'lose')).toBe('win');
    expect(settleOutcome('lose', 'win')).toBe('lose');
    expect(settleOutcome(undefined, 'lose')).toBe('lose');
    expect(settleOutcome(undefined, 'ended')).toBe('ended');
  });
});

describe('boss and hero dying close together (#315)', () => {
  // The hero's clip ends 250 ms before the boss's, so a hero dropping within
  // that gap after the blow used to lose, and one dropping later won over a
  // corpse. The decision is taken at the blow, so the gap is moot.
  for (const gapMs of [0, 100, 250, 500, 999]) {
    it(`a lethal hit ${gapMs} ms after the boss's killing blow cannot undo the win`, () => {
      expect(record(0, gapMs)).toBe('win');
    });
  }

  it('a hero dead before the boss takes its blow stays a loss, however soon the blow follows', () => {
    for (const gapMs of [1, 100, 250, 500, 749]) {
      expect(record(gapMs, 0), `blow ${gapMs} ms after the hero's`).toBe('lose');
    }
  });
});
