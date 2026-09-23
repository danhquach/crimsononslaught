import { describe, expect, it } from 'vitest';
import { AUDIO_SETTING_KEYS } from '../config/sounds';
import {
  clampVolume,
  effectiveVolume,
  readAudioSettings,
  shouldPlay,
  stepVolume,
  writeAudioSettings,
  type AudioSettings,
  type PlayLedger,
} from './audioMix';

const loud: AudioSettings = { master: 1, sfx: 1, music: 1, muted: false };

describe('clampVolume', () => {
  it('clamps into [0, 1] and falls back on anything unusable', () => {
    expect(clampVolume(0.5, 1)).toBe(0.5);
    expect(clampVolume(2, 1)).toBe(1);
    expect(clampVolume(-1, 1)).toBe(0);
    expect(clampVolume(NaN, 0.7)).toBe(0.7);
    expect(clampVolume('1', 0.7)).toBe(0.7);
    expect(clampVolume(undefined, 0.7)).toBe(0.7);
  });
});

describe('effectiveVolume', () => {
  it('multiplies master, channel and clip gains', () => {
    expect(effectiveVolume({ ...loud, master: 0.5, sfx: 0.5 }, 'sfx', 0.5)).toBeCloseTo(0.125);
    expect(effectiveVolume({ ...loud, music: 0.2 }, 'music')).toBeCloseTo(0.2);
  });

  it('is 0 when muted, whatever the gains', () => {
    expect(effectiveVolume({ ...loud, muted: true }, 'sfx', 1)).toBe(0);
  });

  it('a channel at 0 silences that channel only', () => {
    expect(effectiveVolume({ ...loud, music: 0 }, 'sfx')).toBe(1);
    expect(effectiveVolume({ ...loud, music: 0 }, 'music')).toBe(0);
  });
});

describe('shouldPlay', () => {
  const rule = { minGapMs: 100, maxConcurrent: 2 };

  it('plays on an empty ledger and records the start', () => {
    const decision = shouldPlay('k', 1000, rule, {});
    expect(decision.play).toBe(true);
    expect(decision.ledger).toEqual({ k: [1000] });
  });

  it('caps identical requests inside the window and drops the rest', () => {
    let ledger: PlayLedger = {};
    const plays = [1000, 1010, 1020, 1030].map((at) => {
      const d = shouldPlay('k', at, rule, ledger);
      ledger = d.ledger;
      return d.play;
    });
    expect(plays).toEqual([true, true, false, false]);
    expect(ledger.k).toEqual([1000, 1010]);
  });

  it('forgets starts once the window has passed', () => {
    const ledger: PlayLedger = { k: [1000, 1010] };
    const d = shouldPlay('k', 1100, rule, ledger);
    expect(d.play).toBe(true);
    expect(d.ledger.k).toEqual([1010, 1100]);
  });

  it('keys are independent', () => {
    const ledger: PlayLedger = { k: [1000, 1010] };
    expect(shouldPlay('other', 1010, rule, ledger).play).toBe(true);
  });

  it('never mutates the ledger it is given', () => {
    const ledger: PlayLedger = { k: [1000] };
    shouldPlay('k', 1010, rule, ledger);
    expect(ledger).toEqual({ k: [1000] });
  });

  it('a clock that jumped backwards starts a fresh window', () => {
    const ledger: PlayLedger = { k: [5000, 5010] };
    expect(shouldPlay('k', 100, rule, ledger).play).toBe(true);
  });

  it('a window of 0 or a cap below 1 still allows one play at a time', () => {
    expect(shouldPlay('k', 10, { minGapMs: 0, maxConcurrent: 0 }, { k: [10] }).play).toBe(true);
    expect(shouldPlay('k', 10, { minGapMs: 50, maxConcurrent: 0 }, { k: [10] }).play).toBe(false);
  });
});

describe('settings round trip', () => {
  it('reads defaults from an empty or unusable settings record', () => {
    expect(readAudioSettings({})).toEqual(loud);
    expect(
      readAudioSettings({
        [AUDIO_SETTING_KEYS.master]: 'loud',
        [AUDIO_SETTING_KEYS.sfx]: -3,
        [AUDIO_SETTING_KEYS.muted]: 'yes',
      }),
    ).toEqual({ ...loud, sfx: 0 });
  });

  it('writes then reads back the same settings and keeps other keys', () => {
    const audio: AudioSettings = { master: 0.4, sfx: 0.9, music: 0, muted: true };
    const written = writeAudioSettings({ theme: 'dark' }, audio);
    expect(written.theme).toBe('dark');
    expect(readAudioSettings(written)).toEqual(audio);
  });

  it('writes only primitives a save can hold', () => {
    const written = writeAudioSettings({}, { master: 2, sfx: NaN, music: 0.5, muted: true });
    expect(written).toEqual({
      [AUDIO_SETTING_KEYS.master]: 1,
      [AUDIO_SETTING_KEYS.sfx]: 1,
      [AUDIO_SETTING_KEYS.music]: 0.5,
      [AUDIO_SETTING_KEYS.muted]: true,
    });
  });
});

describe('stepVolume', () => {
  it('moves one tenth per press and lands on the notch grid', () => {
    expect(stepVolume(1, -1)).toBe(0.9);
    expect(stepVolume(0.2, 1)).toBe(0.3);
    let volume = 1;
    for (let i = 0; i < 7; i += 1) volume = stepVolume(volume, -1);
    expect(volume).toBe(0.3);
  });

  it('stops at both ends', () => {
    expect(stepVolume(1, 1)).toBe(1);
    expect(stepVolume(0, -1)).toBe(0);
  });

  it('snaps an off-grid volume to the nearest notch before stepping', () => {
    expect(stepVolume(0.44, 1)).toBe(0.5);
    expect(stepVolume(Number.NaN, 1)).toBe(0.1);
  });
});
