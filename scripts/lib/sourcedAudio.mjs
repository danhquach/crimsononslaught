/**
 * Sound effects taken from outside the repo (CO-177): which keys they voice,
 * where each came from, and how it is cut to game length.
 *
 * `npm run audio:gen` skips these keys, so regenerating never puts the old
 * blips back. `npm run audio:cut -- <dir>` re-cuts them from the downloaded
 * originals, checked against `sha256`. Licences are recorded in
 * `public/assets/audio/CREDITS.md`.
 */

import { samplesFor } from './synth.mjs';

/**
 * `start` skips into the clip after its leading silence, for a clip whose
 * body comes late. `seconds` is the length kept, fade-out included.
 */
export const SOURCED = {
  'cast.fire': {
    slug: 'fire-electric-whoosh-flame-05',
    title: 'Fireball Flame Whoosh Burst 05',
    sha256: 'e6564d0264d294d6f2ba3dc23024b598fe1beac452482ab503e6a15368b4546c',
    // The whoosh builds for about a second first; a cast wants the burst.
    start: 1.1,
    seconds: 0.6,
  },
  'enemy.death': {
    slug: 'retro-game-hit-01',
    title: 'Crunchy Retro Game Hit 01',
    sha256: 'c5ef9c8f9fd4a4ddfd7174db1aa5835ee5b3af7dfe0f6179d466b8e46dd26109',
    start: 0,
    seconds: 0.4,
  },
  'progress.gem': {
    slug: 'retro-game-coin-13',
    title: 'Double-Chime 8-Bit Coin Pickup 13',
    sha256: 'a3c4ca33dbb1091e4ea072784a4ac4ae74a121c021bff3eaee6c40fa2305951d',
    start: 0,
    seconds: 0.3,
  },
  'progress.levelUp': {
    slug: 'retro-game-power-up-25',
    title: 'Ascending Arpeggio 8-Bit Power-Up 25',
    sha256: '31089b962bfb1f48cd59426e4346bc8782a2987dadf223c7f29da69eaa9e19bc',
    start: 0,
    seconds: 0.9,
  },
};

export const SOURCE_URL = (slug) => `https://sfxmint.com/sounds/${slug}`;
export const DOWNLOAD_URL = (slug) => `https://sfxmint.com/dl/${slug}.wav`;
export const SOURCED_LICENCE = 'CC0-1.0';

/** Below this level a sample counts as silence when trimming, dBFS. */
export const SILENCE_DB = -50;
/** Fade-in, so a cut that starts mid-sound does not click. */
export const FADE_IN_S = 0.005;
export const FADE_OUT_S = 0.08;

/**
 * Trim leading and trailing silence, skip `start` seconds, keep `seconds`
 * and fade both ends linearly. Pure: a new array, the input is untouched.
 */
export function cutClip(samples, { start, seconds }) {
  const floor = 10 ** (SILENCE_DB / 20);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < floor) first += 1;
  let end = samples.length;
  while (end > first && Math.abs(samples[end - 1]) < floor) end -= 1;

  const from = Math.min(end, first + samplesFor(start));
  const out = samples.slice(from, Math.min(end, from + samplesFor(seconds)));
  // Each fade takes at most half the cut, so on a very short one they never overlap.
  const half = Math.floor(out.length / 2);
  const fadeIn = Math.min(half, samplesFor(FADE_IN_S));
  const fadeOut = Math.min(half, samplesFor(FADE_OUT_S));
  for (let i = 0; i < fadeIn; i += 1) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) out[out.length - 1 - i] *= i / fadeOut;
  return out;
}
