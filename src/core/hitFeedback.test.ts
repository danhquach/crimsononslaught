import { describe, expect, it } from 'vitest';
import {
  CRIT_SIZE_BONUS,
  DEFAULT_FEEDBACK_SETTINGS,
  DOT_NUMBER_INTERVAL_MS,
  FEEDBACK_SETTING_KEYS,
  HEAVY_HIT_DAMAGE,
  HIT_STOP_BUDGET_MS,
  HIT_STOP_CRIT_MS,
  HIT_STOP_MS,
  HIT_STOP_REFILL,
  MAX_SHAKE_INTENSITY,
  NUMBER_COLORS,
  NUMBER_SIZE_TIERS,
  NUMBER_SPREAD_PX,
  SHAKES,
  SHAKE_REST_MS,
} from '../config/hitFeedback';
import {
  NO_HIT_STOP,
  NO_SHAKE,
  addDot,
  ageDot,
  critDamage,
  hitStopMs,
  nextShake,
  numberPose,
  numberSpread,
  numberStyle,
  numberText,
  readFeedbackSettings,
  requestHitStop,
  rollCrit,
  shownDamage,
  spendHitStop,
  writeFeedbackSettings,
  type HitStopState,
  type ShakeState,
} from './hitFeedback';
import { createRng, type Rng } from './rng';

/** An Rng that counts its draws and returns `value` for every one. */
function fixedRng(value: number): Rng & { draws: number } {
  const rng = {
    draws: 0,
    next: () => {
      rng.draws += 1;
      return value;
    },
  };
  return rng as unknown as Rng & { draws: number };
}

describe('rollCrit', () => {
  it('crits when the draw is under the chance', () => {
    expect(rollCrit(fixedRng(0.1), 0.2)).toBe(true);
    expect(rollCrit(fixedRng(0.3), 0.2)).toBe(false);
  });

  it('never draws at chance 0 or 1, so a run without Precision leaves the stream alone', () => {
    const rng = fixedRng(0);
    expect(rollCrit(rng, 0)).toBe(false);
    expect(rollCrit(rng, -1)).toBe(false);
    expect(rollCrit(rng, Number.NaN)).toBe(false);
    expect(rollCrit(rng, 1)).toBe(true);
    expect(rng.draws).toBe(0);
  });

  it('reproduces the same rolls from the same seed', () => {
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 50 }, () => rollCrit(rng, 0.3));
    };
    expect(roll(7)).toEqual(roll(7));
    expect(roll(7)).not.toEqual(roll(8));
  });

  it('crits at about the chance over many rolls', () => {
    const rng = createRng(1);
    let crits = 0;
    for (let i = 0; i < 10_000; i += 1) if (rollCrit(rng, 0.25)) crits += 1;
    expect(crits / 10_000).toBeGreaterThan(0.23);
    expect(crits / 10_000).toBeLessThan(0.27);
  });
});

describe('critDamage', () => {
  it('multiplies the hit', () => {
    expect(critDamage(10, 1.5)).toBe(15);
    expect(critDamage(12, 2.25)).toBe(27);
  });

  it('never hits softer than the hit itself', () => {
    expect(critDamage(10, 0.5)).toBe(10);
    expect(critDamage(10, Number.NaN)).toBe(10);
  });
});

describe('shownDamage and numberText', () => {
  it('rounds to a whole number and prints at least 1 for any damage', () => {
    expect(shownDamage(12.4)).toBe(12);
    expect(shownDamage(12.5)).toBe(13);
    expect(shownDamage(0.2)).toBe(1);
  });

  it('prints nothing for no damage', () => {
    expect(shownDamage(0)).toBe(0);
    expect(shownDamage(-3)).toBe(0);
    expect(shownDamage(Number.NaN)).toBe(0);
    expect(shownDamage(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('calls a crit out with a !', () => {
    expect(numberText(18, false)).toBe('18');
    expect(numberText(18, true)).toBe('18!');
  });
});

describe('numberStyle', () => {
  it('prints bigger hits bigger, one size per tier', () => {
    const sizes = NUMBER_SIZE_TIERS.map((tier) => numberStyle(tier.min, 'hit', false).size);
    expect(sizes).toEqual(NUMBER_SIZE_TIERS.map((tier) => tier.size));
    for (let i = 1; i < sizes.length; i += 1) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]!);
    expect(numberStyle(1, 'hit', false).size).toBe(NUMBER_SIZE_TIERS[0]!.size);
  });

  it('makes a crit larger, gold, and rise higher for longer', () => {
    const hit = numberStyle(30, 'hit', false);
    const crit = numberStyle(30, 'hit', true);
    expect(crit.size).toBe(hit.size + CRIT_SIZE_BONUS);
    expect(crit.color).toBe(NUMBER_COLORS.crit);
    expect(crit.risePx).toBeGreaterThan(hit.risePx);
    expect(crit.riseMs).toBeGreaterThan(hit.riseMs);
  });

  it('colours damage over time apart from a hit', () => {
    expect(numberStyle(5, 'hit', false).color).toBe(NUMBER_COLORS.hit);
    expect(numberStyle(5, 'tick', false).color).toBe(NUMBER_COLORS.tick);
    expect(numberStyle(5, 'dot', false).color).toBe(NUMBER_COLORS.tick);
  });
});

describe('numberSpread', () => {
  it('stays within the spread and does not repeat across a burst', () => {
    const spreads = Array.from({ length: 64 }, (_, i) => numberSpread(i));
    for (const s of spreads) expect(Math.abs(s)).toBeLessThanOrEqual(NUMBER_SPREAD_PX);
    expect(new Set(spreads.map((s) => s.toFixed(3))).size).toBe(spreads.length);
  });
});

describe('numberPose', () => {
  const style = numberStyle(10, 'hit', false);

  it('starts where it was printed, solid', () => {
    expect(numberPose(style, 0)).toEqual({ dy: -0, alpha: 1, done: false });
  });

  it('rises the whole way and fades out by the end', () => {
    const end = numberPose(style, style.riseMs);
    expect(end.dy).toBeCloseTo(-style.risePx);
    expect(end.alpha).toBe(0);
    expect(end.done).toBe(true);
  });

  it('rises every step and never fades back in', () => {
    let last = numberPose(style, 0);
    for (let ms = 16; ms <= style.riseMs; ms += 16) {
      const pose = numberPose(style, ms);
      expect(pose.dy).toBeLessThanOrEqual(last.dy);
      expect(pose.alpha).toBeLessThanOrEqual(last.alpha);
      last = pose;
    }
  });
});

describe('hitStopMs', () => {
  it('freezes on a heavy hit or a crit and nothing else', () => {
    expect(hitStopMs(HEAVY_HIT_DAMAGE - 1, 'hit', false, 1)).toBe(0);
    expect(hitStopMs(HEAVY_HIT_DAMAGE, 'hit', false, 1)).toBe(HIT_STOP_MS);
    expect(hitStopMs(5, 'hit', true, 1)).toBe(HIT_STOP_CRIT_MS);
  });

  it('never freezes on a burn or bleed sliver', () => {
    expect(hitStopMs(1000, 'dot', true, 1)).toBe(0);
  });

  it('scales with the setting, and 0 turns it off', () => {
    expect(hitStopMs(HEAVY_HIT_DAMAGE, 'hit', false, 0.5)).toBe(HIT_STOP_MS / 2);
    expect(hitStopMs(HEAVY_HIT_DAMAGE, 'hit', true, 0)).toBe(0);
    expect(hitStopMs(HEAVY_HIT_DAMAGE, 'hit', true, 3)).toBe(HIT_STOP_CRIT_MS);
  });
});

describe('hit-stop budget', () => {
  it('takes the longest request rather than adding them up', () => {
    let state: HitStopState = NO_HIT_STOP;
    for (let i = 0; i < 40; i += 1) state = requestHitStop(state, HIT_STOP_MS);
    expect(state.pendingMs).toBe(HIT_STOP_MS);
    state = requestHitStop(state, HIT_STOP_CRIT_MS);
    expect(state.pendingMs).toBe(HIT_STOP_CRIT_MS);
  });

  it('grants no more than the budget holds', () => {
    let state: HitStopState = { pendingMs: 0, budgetMs: 10 };
    state = requestHitStop(state, HIT_STOP_CRIT_MS);
    expect(state).toEqual({ pendingMs: 10, budgetMs: 0 });
  });

  it('freezes from the front of the window and moves the rest', () => {
    const spent = spendHitStop({ pendingMs: 20, budgetMs: 0 }, 50);
    expect(spent.frozenMs).toBe(20);
    expect(spent.state.pendingMs).toBe(0);
    expect(spent.state.budgetMs).toBeCloseTo(30 * HIT_STOP_REFILL);
  });

  it('carries a freeze longer than the window into the next one', () => {
    const spent = spendHitStop({ pendingMs: 50, budgetMs: 0 }, 16);
    expect(spent.frozenMs).toBe(16);
    expect(spent.state.pendingMs).toBe(34);
  });

  it('never refills past the budget', () => {
    const spent = spendHitStop(NO_HIT_STOP, 100_000);
    expect(spent.state.budgetMs).toBe(HIT_STOP_BUDGET_MS);
  });

  it('never freezes more than a small share of a run, however many crits land', () => {
    // A crit on every 60 fps frame for ten minutes of run time.
    let state: HitStopState = NO_HIT_STOP;
    let frozen = 0;
    const frames = 60 * 600;
    for (let i = 0; i < frames; i += 1) {
      state = requestHitStop(state, HIT_STOP_CRIT_MS);
      const spent = spendHitStop(state, 1000 / 60);
      state = spent.state;
      frozen += spent.frozenMs;
    }
    const share = frozen / (frames * (1000 / 60));
    expect(share).toBeLessThan(0.08);
    expect(share).toBeGreaterThan(0);
  });
});

describe('damage-over-time tally', () => {
  it('sums slivers and prints them once the interval has passed', () => {
    let tally = addDot(undefined, 0.1);
    let printed = 0;
    for (let ms = 0; ms < DOT_NUMBER_INTERVAL_MS; ms += 1000 / 60) {
      tally = addDot(tally, 0.1);
      const aged = ageDot(tally, 1000 / 60);
      tally = aged.tally;
      printed += aged.due;
    }
    expect(printed).toBeGreaterThan(1.5);
    expect(tally.amount).toBeLessThan(0.2);
  });

  it('holds a tally until it is due', () => {
    const aged = ageDot({ amount: 3, ageMs: 0 }, DOT_NUMBER_INTERVAL_MS - 1);
    expect(aged.due).toBe(0);
    expect(aged.tally).toEqual({ amount: 3, ageMs: DOT_NUMBER_INTERVAL_MS - 1 });
  });

  it('keeps the age of the first sliver as more land', () => {
    expect(addDot({ amount: 1, ageMs: 120 }, 2)).toEqual({ amount: 3, ageMs: 120 });
  });
});

describe('nextShake', () => {
  const hurt = SHAKES.playerHurt;

  it('plays on a still camera', () => {
    const next = nextShake(NO_SHAKE, hurt, 1000, 1);
    expect(next.play).toEqual(hurt);
    expect(next.state).toEqual({ endsAtMs: 1000 + hurt.durationMs, intensity: hurt.intensity });
  });

  it('does not restart an equal shake while one runs or the camera rests', () => {
    const running: ShakeState = { endsAtMs: 1100, intensity: hurt.intensity };
    expect(nextShake(running, hurt, 1050, 1).play).toBeNull();
    expect(nextShake(running, hurt, 1100 + SHAKE_REST_MS - 1, 1).play).toBeNull();
    expect(nextShake(running, hurt, 1100 + SHAKE_REST_MS, 1).play).toEqual(hurt);
  });

  it('lets a stronger shake cut in', () => {
    const running: ShakeState = { endsAtMs: 1100, intensity: SHAKES.explosion.intensity };
    expect(nextShake(running, SHAKES.bossCharge, 1050, 1).play).toEqual(SHAKES.bossCharge);
  });

  it('scales with the setting, and 0 turns it off', () => {
    expect(nextShake(NO_SHAKE, hurt, 0, 0.5).play?.intensity).toBeCloseTo(hurt.intensity / 2);
    expect(nextShake(NO_SHAKE, hurt, 0, 0).play).toBeNull();
  });

  it('never shakes harder than the cap', () => {
    const huge = { durationMs: 100, intensity: 1 };
    expect(nextShake(NO_SHAKE, huge, 0, 1).play?.intensity).toBe(MAX_SHAKE_INTENSITY);
  });

  it('leaves the screen still most of the time under a stream of explosions', () => {
    let state = NO_SHAKE;
    let shakingMs = 0;
    let lastEnd = Number.NEGATIVE_INFINITY;
    for (let now = 0; now < 10_000; now += 16) {
      const next = nextShake(state, SHAKES.explosion, now, 1);
      state = next.state;
      if (next.play) {
        expect(now).toBeGreaterThanOrEqual(lastEnd + SHAKE_REST_MS);
        shakingMs += next.play.durationMs;
        lastEnd = now + next.play.durationMs;
      }
    }
    expect(shakingMs / 10_000).toBeLessThan(0.35);
  });
});

describe('readFeedbackSettings', () => {
  it('fills every missing key with its default', () => {
    expect(readFeedbackSettings({})).toEqual(DEFAULT_FEEDBACK_SETTINGS);
  });

  it('reads saved values, clamped into range', () => {
    expect(
      readFeedbackSettings({
        [FEEDBACK_SETTING_KEYS.numbers]: false,
        [FEEDBACK_SETTING_KEYS.hitStop]: 0,
        [FEEDBACK_SETTING_KEYS.shake]: 4,
      }),
    ).toEqual({ numbers: false, hitStop: 0, shake: 1 });
  });

  it('ignores unusable values', () => {
    expect(
      readFeedbackSettings({
        [FEEDBACK_SETTING_KEYS.numbers]: 'no',
        [FEEDBACK_SETTING_KEYS.hitStop]: 'off',
        [FEEDBACK_SETTING_KEYS.shake]: Number.NaN,
      }),
    ).toEqual(DEFAULT_FEEDBACK_SETTINGS);
  });
});

describe('writeFeedbackSettings', () => {
  it('writes then reads back the same settings and keeps other keys', () => {
    const feedback = { numbers: false, hitStop: 0, shake: 0.5 };
    const written = writeFeedbackSettings({ 'audio.muted': true }, feedback);
    expect(written['audio.muted']).toBe(true);
    expect(readFeedbackSettings(written)).toEqual(feedback);
  });

  it('clamps what it writes into range', () => {
    expect(writeFeedbackSettings({}, { numbers: true, hitStop: 3, shake: Number.NaN })).toEqual({
      [FEEDBACK_SETTING_KEYS.numbers]: true,
      [FEEDBACK_SETTING_KEYS.hitStop]: 1,
      [FEEDBACK_SETTING_KEYS.shake]: DEFAULT_FEEDBACK_SETTINGS.shake,
    });
  });
});
