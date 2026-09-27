import { describe, expect, it } from 'vitest';
import {
  SAMPLE_RATE,
  additive,
  concat,
  envelope,
  hold,
  loopMix,
  lowpass,
  midiHz,
  mix,
  noise,
  normalize,
  readWav,
  resample,
  samplesFor,
  sweep,
  triangle,
  wavBytes,
} from './synth.mjs';

describe('synth', () => {
  it('sweep is the asked length and stays within [-1, 1]', () => {
    const clip = sweep(0.1, 440, 880);
    expect(clip).toHaveLength(samplesFor(0.1));
    expect(clip.every((s) => s >= -1 && s <= 1)).toBe(true);
  });

  it('noise is deterministic for a seed and differs across seeds', () => {
    expect(noise(0.05, 7)).toEqual(noise(0.05, 7));
    expect(noise(0.05, 7)).not.toEqual(noise(0.05, 8));
  });

  it('envelope starts silent and ends near silence', () => {
    const clip = envelope(new Array(2205).fill(1), 0.01);
    expect(clip[0]).toBe(0);
    expect(Math.abs(clip[clip.length - 1])).toBeLessThan(0.01);
  });

  it('mix pads to the longest layer and concat joins', () => {
    expect(mix([[1, 1], 0.5], [[1, 1, 1], 1])).toEqual([1.5, 1.5, 1]);
    expect(concat([1], [2, 3])).toEqual([1, 2, 3]);
  });

  it('normalize puts the peak at the asked level and leaves silence alone', () => {
    expect(normalize([0.2, -0.4], 0.8)).toEqual([0.4, -0.8]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it('wavBytes writes a 44-byte RIFF header with 16-bit mono PCM', () => {
    const bytes = wavBytes([0, 1, -1]);
    expect(bytes).toHaveLength(44 + 6);
    const text = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(text(36, 40)).toBe('data');
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
  });

  it('readWav reads back what wavBytes wrote, and refuses anything else', () => {
    const clip = [0, 0.5, -0.25, 1, -1];
    const back = readWav(wavBytes(clip));
    expect(back).toHaveLength(clip.length);
    for (const [i, s] of clip.entries()) expect(back[i]).toBeCloseTo(s, 4);
    expect(() => readWav(new Uint8Array(10))).toThrow();
    const stereo = wavBytes(clip);
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(() => readWav(stereo)).toThrow();
  });

  it('resample speeds a clip up or slows it down by the ratio, interpolating', () => {
    const ramp = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(resample(ramp, 1)).toEqual(ramp);
    expect(resample(ramp, 2)).toEqual([0, 2, 4, 6, 8]);
    expect(resample(ramp, 0.5)).toHaveLength(17);
    expect(resample(ramp, 0.5)[3]).toBe(1.5);
    expect(resample([], 2)).toEqual([]);
    expect(resample(ramp, 0)).toEqual([]);
  });

  it('midiHz puts A4 at 440 Hz and an octave at twice the frequency', () => {
    expect(midiHz(69)).toBe(440);
    expect(midiHz(81)).toBe(880);
    expect(midiHz(60)).toBeCloseTo(261.63, 2);
  });

  it('triangle stays within [-1, 1] and peaks where the sine does', () => {
    expect(triangle(Math.PI / 2)).toBeCloseTo(1, 9);
    expect(triangle(-Math.PI / 2)).toBeCloseTo(-1, 9);
    expect(triangle(0)).toBe(0);
  });

  it('hold rises, holds flat and falls to exactly 0', () => {
    const clip = hold(new Array(2205).fill(1), 0.01, 0.02);
    expect(clip[0]).toBe(0);
    expect(clip[1000]).toBe(1);
    expect(clip[clip.length - 1]).toBe(0);
  });

  it('lowpass keeps a steady level and softens a step', () => {
    const out = lowpass(new Array(2000).fill(1), 500);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0]).toBeLessThan(0.5);
    expect(out[out.length - 1]).toBeCloseTo(1, 6);
  });

  it('loopMix is exactly the asked length and folds a tail back onto the start', () => {
    const n = samplesFor(1);
    const out = loopMix(1, [
      [0, [1, 1], 0.5],
      [(n - 1) / SAMPLE_RATE, [2, 3, 4], 1],
    ]);
    expect(out).toHaveLength(n);
    expect(out.slice(0, 3)).toEqual([0.5 + 3, 0.5 + 4, 0]);
    expect(out[n - 1]).toBe(2);
    expect(loopMix(0, [[0, [1], 1]])).toEqual([]);
  });

  it('additive is the asked length, sums its partials to a peak of 1, and wobbles only with vibrato', () => {
    const plain = additive(0.1, 441, [[1, 1]]);
    expect(plain).toHaveLength(samplesFor(0.1));
    expect(plain).toEqual(sweep(0.1, 441, 441));
    const organ = additive(0.1, 220, [
      [1, 1],
      [2, 1],
    ]);
    expect(Math.max(...organ.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(additive(0.1, 220, [[1, 1]], { vibratoHz: 5, vibrato: 0.01 })).not.toEqual(
      additive(0.1, 220, [[1, 1]]),
    );
  });
});
