/**
 * Tiny additive synth for the sound effects (CO-102). Pure functions over
 * plain arrays of samples in [-1, 1]; `wavBytes` packs them as 16-bit mono
 * PCM. No dependencies, no clock, no `Math.random`: the noise source is a
 * seeded LCG so `npm run audio:gen` writes byte-identical files every run.
 */

export const SAMPLE_RATE = 22050;

/** Seconds -> whole samples at `rate`. */
export function samplesFor(seconds, rate = SAMPLE_RATE) {
  return Math.max(0, Math.round(seconds * rate));
}

/**
 * A sine whose frequency glides linearly from `fromHz` to `toHz` over the
 * clip. Phase is integrated so the glide has no clicks.
 */
export function sweep(seconds, fromHz, toHz, rate = SAMPLE_RATE, shape = Math.sin) {
  const n = samplesFor(seconds, rate);
  const out = new Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const hz = fromHz + (toHz - fromHz) * t;
    out[i] = shape(phase);
    phase += (2 * Math.PI * hz) / rate;
  }
  return out;
}

/** A square wave built on `sweep`'s phase, for the harsher voices. */
export const square = (phase) => (Math.sin(phase) >= 0 ? 1 : -1);

/**
 * White noise from a 32-bit LCG (Numerical Recipes constants), then one-pole
 * low-passed at `cutoffHz` so a whoosh can be soft and a crackle bright.
 */
export function noise(seconds, seed, cutoffHz = 8000, rate = SAMPLE_RATE) {
  const n = samplesFor(seconds, rate);
  const out = new Array(n);
  let state = seed >>> 0;
  const alpha = Math.min(1, (2 * Math.PI * cutoffHz) / rate);
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 0x7fffffff - 1;
    last += alpha * (white - last);
    out[i] = last;
  }
  return out;
}

/**
 * Attack/decay envelope: linear rise over `attackS`, then an exponential fall
 * to silence by the end of the clip. Applied in place and returned.
 */
export function envelope(samples, attackS, rate = SAMPLE_RATE) {
  const n = samples.length;
  const attack = Math.max(1, samplesFor(attackS, rate));
  for (let i = 0; i < n; i += 1) {
    const rise = Math.min(1, i / attack);
    const fall = n <= 1 ? 1 : Math.exp(-5 * (i / (n - 1)));
    samples[i] *= rise * fall;
  }
  return samples;
}

/** Sample-wise sum of clips, the shortest padded with silence; each scaled by its gain. */
export function mix(...layers) {
  const n = Math.max(0, ...layers.map(([samples]) => samples.length));
  const out = new Array(n).fill(0);
  for (const [samples, gain = 1] of layers) {
    for (let i = 0; i < samples.length; i += 1) out[i] += samples[i] * gain;
  }
  return out;
}

/** Clips played one after another. */
export function concat(...clips) {
  return clips.flat();
}

/** Scale so the loudest sample sits at `peak`; silence stays silent. */
export function normalize(samples, peak = 0.9) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const gain = peak / max;
  return samples.map((s) => s * gain);
}

/** 16-bit mono PCM WAV (RIFF) of the clip. */
export function wavBytes(samples, rate = SAMPLE_RATE) {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

/**
 * The samples of a 16-bit mono PCM WAV as `wavBytes` writes it (44-byte
 * header, `data` straight after `fmt `), in [-1, 1]. What lets a recipe build
 * on a clip already in the repo (CO-158); anything else throws.
 */
export function readWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset) =>
    String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));
  if (
    bytes.byteLength < 44 ||
    ascii(0) !== 'RIFF' ||
    ascii(36) !== 'data' ||
    view.getUint16(22, true) !== 1 ||
    view.getUint16(34, true) !== 16
  ) {
    throw new Error('not a 16-bit mono WAV with a 44-byte header');
  }
  const n = Math.floor(Math.min(view.getUint32(40, true), bytes.byteLength - 44) / 2);
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(44 + i * 2, true) / 32767;
  return out;
}

/**
 * Play a clip `ratio` times as fast, tape-style: above 1 it is shorter and
 * higher, below 1 longer and lower. Linear interpolation between samples.
 */
export function resample(samples, ratio) {
  if (!(ratio > 0) || samples.length === 0) return [];
  const n = Math.max(1, Math.floor((samples.length - 1) / ratio) + 1);
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const at = i * ratio;
    const lo = Math.floor(at);
    const hi = Math.min(samples.length - 1, lo + 1);
    out[i] = samples[lo] + (samples[hi] - samples[lo]) * (at - lo);
  }
  return out;
}
