import { describe, expect, it } from 'vitest';
import {
  SAMPLE_RATE,
  concat,
  envelope,
  mix,
  noise,
  normalize,
  samplesFor,
  sweep,
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
});
