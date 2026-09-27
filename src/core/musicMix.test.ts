import { describe, expect, it } from 'vitest';
import { BOSS_TRACKS, MUSIC_FADE_MS, RUN_TRACKS } from '../config/sounds';
import {
  MAX_FADE_STEP_MS,
  musicVolume,
  pickRunMusic,
  stepMusicFade,
  type MusicGains,
} from './musicMix';
import { createRng } from './rng';

const FRAME_MS = 1000 / 60;

/** Step `ms` of frames toward `target`, calling `each` with the gains after every frame. */
function run(
  gains: MusicGains,
  target: string | null,
  ms: number,
  each: (g: MusicGains) => void = () => {},
): MusicGains {
  let out = gains;
  for (let t = 0; t < ms; t += FRAME_MS) {
    out = stepMusicFade(out, target, FRAME_MS, MUSIC_FADE_MS);
    each(out);
  }
  return out;
}

const sum = (gains: MusicGains): number => Object.values(gains).reduce((a, b) => a + b, 0);

describe('stepMusicFade', () => {
  it('fades a track in from silence over about the fade time', () => {
    expect(run({}, 'menu', MUSIC_FADE_MS * 0.5).menu).toBeCloseTo(0.5, 1);
    expect(run({}, 'menu', MUSIC_FADE_MS + FRAME_MS)).toEqual({ menu: 1 });
  });

  it('crossfades over about the fade time, never summing above 1', () => {
    const sums: number[] = [];
    const after = run({ menu: 1 }, 'run', MUSIC_FADE_MS + 2 * FRAME_MS, (g) => sums.push(sum(g)));
    expect(after).toEqual({ run: 1 });
    expect(Math.max(...sums)).toBeLessThanOrEqual(1 + 1e-9);
    const half = run({ menu: 1 }, 'run', MUSIC_FADE_MS * 0.5);
    expect(half.menu).toBeCloseTo(0.5, 1);
    expect(half.run).toBeCloseTo(0.5, 1);
  });

  it('asking for the track already playing changes nothing', () => {
    expect(stepMusicFade({ run: 1 }, 'run', FRAME_MS, MUSIC_FADE_MS)).toEqual({ run: 1 });
  });

  it('a change of mind mid-fade carries on from where the gains are', () => {
    const mid = run({ menu: 1 }, 'run', MUSIC_FADE_MS * 0.3);
    const next = stepMusicFade(mid, 'menu', FRAME_MS, MUSIC_FADE_MS);
    expect(Math.abs((next.menu ?? 0) - (mid.menu ?? 0))).toBeLessThan(0.02 + 1e-9);
    expect(Math.abs((next.run ?? 0) - (mid.run ?? 0))).toBeLessThan(0.02 + 1e-9);
    expect(run(next, 'menu', MUSIC_FADE_MS)).toEqual({ menu: 1 });
  });

  it('keeps under 1 while three tracks are moving', () => {
    let gains = run({ menu: 1 }, 'run', MUSIC_FADE_MS * 0.4);
    const sums: number[] = [];
    gains = run(gains, 'boss', MUSIC_FADE_MS * 1.5, (g) => sums.push(sum(g)));
    expect(gains).toEqual({ boss: 1 });
    expect(Math.max(...sums)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('null fades everything out and drops the track', () => {
    expect(run({ boss: 1 }, null, MUSIC_FADE_MS + FRAME_MS)).toEqual({});
  });

  it('caps one step, so a long stall or a tab away does not skip the fade', () => {
    const after = stepMusicFade({ menu: 1 }, 'run', 60_000, MUSIC_FADE_MS);
    expect(after.menu).toBeCloseTo(1 - MAX_FADE_STEP_MS / MUSIC_FADE_MS, 9);
    expect(stepMusicFade({ menu: 1 }, 'run', -50, MUSIC_FADE_MS)).toEqual({ menu: 1 });
    expect(stepMusicFade({ menu: 1 }, 'run', Number.NaN, MUSIC_FADE_MS)).toEqual({ menu: 1 });
  });

  it('leaves the gains passed in untouched', () => {
    const gains = { menu: 1 };
    stepMusicFade(gains, 'run', FRAME_MS, MUSIC_FADE_MS);
    expect(gains).toEqual({ menu: 1 });
  });
});

describe('musicVolume', () => {
  const settings = { master: 0.5, sfx: 1, music: 0.8, muted: false };

  it('is fade × master × music × track', () => {
    expect(musicVolume(settings, 0.5, 0.25)).toBeCloseTo(0.05, 9);
    expect(musicVolume({ ...settings, sfx: 0 }, 1, 1)).toBeCloseTo(0.4, 9);
  });

  it('is 0 at once when muted or the music volume is 0, whatever the fade', () => {
    expect(musicVolume({ ...settings, muted: true }, 1, 1)).toBe(0);
    expect(musicVolume({ ...settings, music: 0 }, 1, 1)).toBe(0);
  });
});

describe('pickRunMusic', () => {
  it('draws one run track and one boss track, the same for the same stream', () => {
    const pair = pickRunMusic(createRng(7));
    expect(RUN_TRACKS).toContain(pair.run);
    expect(BOSS_TRACKS).toContain(pair.boss);
    expect(pickRunMusic(createRng(7))).toEqual(pair);
  });

  it('every pairing comes up over a few runs', () => {
    const rng = createRng(1);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const { run, boss } = pickRunMusic(rng);
      seen.add(`${run}+${boss}`);
    }
    expect(seen.size).toBe(RUN_TRACKS.length * BOSS_TRACKS.length);
  });
});
