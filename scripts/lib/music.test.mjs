import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MUSIC, MUSIC_KEYS, SOUNDS } from '../../src/config/sounds';
import { configuredKeys } from '../gen-audio.mjs';
import { BEATS_PER_BAR, MUSIC_RECIPES, trackSeconds } from './music.mjs';
import { SAMPLE_RATE, normalize, readWav, samplesFor, wavBytes } from './synth.mjs';

const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/audio');
const shipped = (key) => readWav(readFileSync(join(AUDIO_DIR, `${key}.wav`)));

const rms = (samples) => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
const db = (gain) => 20 * Math.log10(gain);

describe('music tracks (CO-157)', () => {
  it('has one recipe per MUSIC_KEYS key, and gen-audio reads the same list', () => {
    expect(Object.keys(MUSIC_RECIPES).sort()).toEqual([...MUSIC_KEYS].sort());
    expect(configuredKeys('MUSIC_KEYS')).toEqual([...MUSIC_KEYS]);
  });

  it('each track is a whole number of bars long at its tempo', () => {
    for (const [key, recipe] of Object.entries(MUSIC_RECIPES)) {
      expect(Number.isInteger(recipe.bars) && recipe.bars > 0, key).toBe(true);
      const samples = recipe.render(recipe);
      expect(samples, key).toHaveLength(samplesFor(trackSeconds(recipe)));
      expect(trackSeconds(recipe), key).toBeCloseTo(
        (recipe.bars * BEATS_PER_BAR * 60) / recipe.bpm,
      );
    }
  });

  it('the loop seam is no bigger a step than the track takes anywhere else', () => {
    for (const key of MUSIC_KEYS) {
      const samples = shipped(key);
      let widest = 0;
      for (let i = 1; i < samples.length; i += 1)
        widest = Math.max(widest, Math.abs(samples[i] - samples[i - 1]));
      const seam = Math.abs(samples[0] - samples[samples.length - 1]);
      expect(seam, key).toBeLessThanOrEqual(widest);
      // And small in absolute terms: under 1% of full scale, well below a click.
      expect(seam, key).toBeLessThan(0.01);
    }
  });

  it('the shipped tracks are what the recipes render, byte for byte', () => {
    for (const [key, recipe] of Object.entries(MUSIC_RECIPES)) {
      const rendered = wavBytes(normalize(recipe.render(recipe)));
      expect(Buffer.from(rendered).equals(readFileSync(join(AUDIO_DIR, `${key}.wav`))), key).toBe(
        true,
      );
    }
  });

  it('each shipped track stays short: under 16 s and 700 KiB', () => {
    for (const key of MUSIC_KEYS) {
      const bytes = readFileSync(join(AUDIO_DIR, `${key}.wav`)).length;
      expect(bytes, key).toBeLessThan(700 * 1024);
      expect(shipped(key).length / SAMPLE_RATE, key).toBeLessThan(16);
    }
  });

  it('every run and boss track plays at least 6 dB under every default cast cue and both hurt cues', () => {
    const cues = [
      'cast.fire',
      'cast.ice',
      'cast.lightning',
      'cast.earth',
      'player.hurt',
      'enemy.hurt',
    ];
    const quietestCue = Math.min(...cues.map((key) => db(rms(shipped(key)) * SOUNDS[key].volume)));
    for (const key of MUSIC_KEYS.filter((k) => k !== 'music.menu')) {
      const track = db(rms(shipped(key)) * MUSIC[key].volume);
      expect(quietestCue - track, key).toBeGreaterThanOrEqual(6);
    }
  });
});
