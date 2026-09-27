import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_COMPANION_STATS } from '../../src/config/companions';
import { ELEMENTS, SPELLS_BY_ELEMENT } from '../../src/config/loadout';
import { PROFILE_CLAMPS } from '../../src/config/passives';
import { SOUNDS, SOUND_KEYS, castSoundFor } from '../../src/config/sounds';
import { BASE_SPELL_STATS } from '../../src/config/spells';
import { shouldPlay } from '../../src/core/audioMix';
import { SAMPLE_RATE, readWav, samplesFor } from './synth.mjs';

const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/audio');

const clipOf = (key) => readFileSync(join(AUDIO_DIR, `${key}.wav`));

/** Every way to hold an element's default spell and two of its other four. */
function loadoutsOf(element) {
  const [first, ...rest] = SPELLS_BY_ELEMENT[element];
  const out = [];
  for (let a = 0; a < rest.length; a += 1)
    for (let b = a + 1; b < rest.length; b += 1) out.push([first, rest[a], rest[b]]);
  return out;
}

describe('per-spell cast clips (CO-158)', () => {
  it('no two spells in one element ship the same clip', () => {
    for (const element of ELEMENTS) {
      const clips = SPELLS_BY_ELEMENT[element].map((id) => clipOf(castSoundFor(id)));
      for (let a = 0; a < clips.length; a += 1)
        for (let b = a + 1; b < clips.length; b += 1)
          expect(clips[a].equals(clips[b]), `${element} ${a} vs ${b}`).toBe(false);
    }
  });

  it('each is a short clip in the shipped format', () => {
    for (const element of ELEMENTS) {
      for (const id of SPELLS_BY_ELEMENT[element]) {
        const wav = clipOf(castSoundFor(id));
        expect(wav.readUInt32LE(24), `${id} rate`).toBe(SAMPLE_RATE);
        const seconds = readWav(wav).length / SAMPLE_RATE;
        expect(seconds, id).toBeGreaterThan(0.05);
        expect(seconds, id).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('one spell asking on every frame stays under clipping', () => {
    // A `?timeScale=10` run at the cooldown floor pays out several casts in
    // one frame; the window is what holds it.
    for (const key of SOUND_KEYS.filter((k) => k.startsWith('cast.'))) {
      expect(peakOf([key], 1000 / 60, 5), key).toBeLessThanOrEqual(1);
    }
  });

  // Windows are per key, so a loadout of one element no longer shares one
  // ledger. The worst real play asks for: three spells of one element, every
  // one at the fastest cast any spell has, all starting on the same instant.
  it('three spells of one element at the cooldown floor stay under clipping', () => {
    for (const element of ELEMENTS) {
      for (const loadout of loadoutsOf(element)) {
        const keys = loadout.map(castSoundFor);
        expect(peakOf(keys, FASTEST_CAST_MS), loadout.join(' + ')).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * The fastest any spell casts in a 1x run: the quickest base cadence in the
 * roster at the `cooldownMul` floor. Checked against every spell, so a slower
 * one is held to a stricter bound than it needs.
 */
const FASTEST_CAST_MS =
  Math.min(
    ...Object.values(BASE_SPELL_STATS).map((stats) => stats.cooldown),
    ...Object.values(BASE_COMPANION_STATS).map((stats) => stats.attackCooldown),
  ) *
  PROFILE_CLAMPS.cooldownMul.min *
  1000;

/**
 * The loudest sample of `keys` each asked for `asks` times every `everyMs`
 * over two seconds, through the same dedupe window the game plays by, at clip
 * volume.
 */
function peakOf(keys, everyMs, asks = 1) {
  const mixed = new Float32Array(samplesFor(3.5));
  for (const key of keys) {
    const def = SOUNDS[key];
    const clip = readWav(clipOf(key));
    let ledger = {};
    for (let nowMs = 0; nowMs < 2000; nowMs += everyMs) {
      for (let ask = 0; ask < asks; ask += 1) {
        const decision = shouldPlay(key, nowMs, def, ledger);
        ledger = decision.ledger;
        if (!decision.play) break;
        const at = samplesFor(nowMs / 1000);
        for (let i = 0; i < clip.length; i += 1) mixed[at + i] += clip[i] * def.volume;
      }
    }
  }
  return mixed.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
}
