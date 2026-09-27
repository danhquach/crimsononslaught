import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SOUNDS, SOUND_KEYS } from '../../src/config/sounds';
import { shouldPlay } from '../../src/core/audioMix';
import { RECIPES, configuredKeys, keyProblems } from '../gen-audio.mjs';
import { FADE_OUT_S, SILENCE_DB, SOURCED, cutClip } from './sourcedAudio.mjs';
import { SAMPLE_RATE, samplesFor } from './synth.mjs';

const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/audio');

describe('sourced sound keys (CO-177)', () => {
  it('every key has a recipe or a sourced clip, never both', () => {
    const recipes = Object.keys(RECIPES);
    const sourced = Object.keys(SOURCED);
    expect([...recipes, ...sourced].sort()).toEqual([...SOUND_KEYS].sort());
    expect(recipes.filter((key) => sourced.includes(key))).toEqual([]);
    expect(configuredKeys()).toEqual([...SOUND_KEYS]);
  });

  it('keyProblems names keys with no clip, with two, and clips with no key', () => {
    expect(keyProblems(['a', 'b', 'c'], ['a', 'b'], ['b', 'd'])).toEqual({
      noClip: ['c'],
      both: ['b'],
      noKey: ['d'],
    });
    expect(keyProblems(['a', 'b'], ['a'], ['b'])).toEqual({ noClip: [], both: [], noKey: [] });
  });

  it('each shipped clip is the generated format, cut to its length, with no extra chunks', () => {
    for (const [key, source] of Object.entries(SOURCED)) {
      const wav = readFileSync(join(AUDIO_DIR, `${key}.wav`));
      expect(wav.toString('ascii', 0, 4), key).toBe('RIFF');
      expect(wav.readUInt16LE(22), `${key} channels`).toBe(1);
      expect(wav.readUInt32LE(24), `${key} rate`).toBe(SAMPLE_RATE);
      expect(wav.readUInt16LE(34), `${key} bits`).toBe(16);
      // `data` straight after `fmt `: no LIST/INFO metadata carried over.
      expect(wav.toString('ascii', 36, 40), key).toBe('data');
      expect(wav.readUInt32LE(40), key).toBe(wav.length - 44);
      expect((wav.length - 44) / 2, key).toBe(samplesFor(source.seconds));
    }
  });
});

/** The clip's samples in [-1, 1], read off a 44-byte-header 16-bit mono WAV. */
function samplesOf(wav) {
  const out = new Float32Array((wav.length - 44) / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = wav.readInt16LE(44 + i * 2) / 32768;
  return out;
}

describe('sourced clips under a flood (CO-177)', () => {
  // The worst a run asks for: several starts of one key on every 60 fps frame
  // for two seconds, through the same dedupe window the game plays by.
  it('a capped stream of starts at clip volume stays under clipping', () => {
    for (const key of Object.keys(SOURCED)) {
      const def = SOUNDS[key];
      const clip = samplesOf(readFileSync(join(AUDIO_DIR, `${key}.wav`)));
      const mixed = new Float32Array(samplesFor(3));
      let ledger = {};
      for (let frame = 0; frame < 120; frame += 1) {
        const nowMs = (frame * 1000) / 60;
        for (let ask = 0; ask < 5; ask += 1) {
          const decision = shouldPlay(key, nowMs, def, ledger);
          ledger = decision.ledger;
          if (!decision.play) break;
          const at = samplesFor(nowMs / 1000);
          for (let i = 0; i < clip.length; i += 1) mixed[at + i] += clip[i] * def.volume;
        }
      }
      const peak = mixed.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
      expect(peak, key).toBeLessThanOrEqual(1);
    }
  });
});

describe('cutClip', () => {
  const floor = 10 ** (SILENCE_DB / 20);

  it('trims silence, skips start, keeps seconds and fades both ends', () => {
    // 0.1 s at 0.25, then 0.9 s at 0.5, padded with near-silence both ends.
    const body = [
      ...new Array(samplesFor(0.1)).fill(0.25),
      ...new Array(samplesFor(0.9)).fill(0.5),
    ];
    const clip = [...new Array(1000).fill(floor / 2), ...body, ...new Array(1000).fill(0)];

    const fromOnset = cutClip(clip, { start: 0, seconds: 0.5 });
    expect(fromOnset[200]).toBe(0.25);

    const out = cutClip(clip, { start: 0.1, seconds: 0.5 });
    expect(out).toHaveLength(samplesFor(0.5));
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(0);
    expect(out[200]).toBe(0.5);
    expect(out[out.length - 1 - samplesFor(FADE_OUT_S)]).toBe(0.5);
  });

  it('stops at the trailing silence when the clip is shorter than asked', () => {
    const clip = [...new Array(samplesFor(0.2)).fill(0.5), ...new Array(samplesFor(1)).fill(0)];
    expect(cutClip(clip, { start: 0, seconds: 0.5 })).toHaveLength(samplesFor(0.2));
  });

  it('leaves its input untouched and returns nothing for silence', () => {
    const clip = [0.5, 0.5, 0.5];
    cutClip(clip, { start: 0, seconds: 1 });
    expect(clip).toEqual([0.5, 0.5, 0.5]);
    expect(cutClip([0, 0, 0], { start: 0, seconds: 1 })).toEqual([]);
  });
});
