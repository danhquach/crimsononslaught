import { describe, expect, it } from 'vitest';
import { ROSTER_SPELL_IDS } from './loadout';
import { CONSUMABLE_KINDS } from './pickups';
import {
  AUDIO_DIR,
  AUDIO_SETTING_KEYS,
  DEFAULT_AUDIO_SETTINGS,
  LOW_HEALTH_RATIO,
  SOUNDS,
  SOUND_KEYS,
  castSoundFor,
  consumableSoundFor,
  isSoundKey,
} from './sounds';

describe('SOUNDS', () => {
  it('has one definition per key and no key without one', () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([...SOUND_KEYS].sort());
    expect(new Set(SOUND_KEYS).size).toBe(SOUND_KEYS.length);
  });

  it('every clip is a file under the audio dir with sane gain and window', () => {
    for (const key of SOUND_KEYS) {
      const def = SOUNDS[key];
      expect(def.files.length, key).toBeGreaterThan(0);
      for (const file of def.files)
        expect(file, key).toMatch(new RegExp(`^${AUDIO_DIR}/[^/]+\\.wav$`));
      expect(def.volume, key).toBeGreaterThan(0);
      expect(def.volume, key).toBeLessThanOrEqual(1);
      expect(def.minGapMs, key).toBeGreaterThan(0);
      expect(Number.isInteger(def.maxConcurrent) && def.maxConcurrent >= 1, key).toBe(true);
    }
  });

  it('isSoundKey accepts the keys and nothing else', () => {
    expect(isSoundKey('ui.move')).toBe(true);
    expect(isSoundKey('ui.nope')).toBe(false);
    expect(isSoundKey(3)).toBe(false);
  });
});

describe('castSoundFor', () => {
  it('gives every roster spell its own cue (CO-158)', () => {
    for (const id of ROSTER_SPELL_IDS) {
      const key = castSoundFor(id);
      expect(key, id).toBe(`cast.${id}`);
      expect(isSoundKey(key), id).toBe(true);
    }
    expect(new Set(ROSTER_SPELL_IDS.map(castSoundFor)).size).toBe(ROSTER_SPELL_IDS.length);
    expect(ROSTER_SPELL_IDS).toHaveLength(20);
  });

  it('falls back to the element cue for a spell with none of its own', () => {
    expect(castSoundFor('fire_unknown')).toBe('cast.fire');
    expect(castSoundFor('earth_new_thing')).toBe('cast.earth');
  });

  it('is undefined for an id no element owns', () => {
    expect(castSoundFor('void_bolt')).toBeUndefined();
    expect(castSoundFor('nope')).toBeUndefined();
    expect(castSoundFor('')).toBeUndefined();
  });

  it('never hands a cast cue a non-cast key', () => {
    expect(castSoundFor('enemy.hurt')).toBeUndefined();
  });

  it('every cast cue stays capped at a few starts per short window', () => {
    for (const key of SOUND_KEYS.filter((k) => k.startsWith('cast.'))) {
      expect(SOUNDS[key].maxConcurrent, key).toBeLessThanOrEqual(2);
      expect(SOUNDS[key].minGapMs, key).toBeGreaterThanOrEqual(90);
    }
  });
});

describe('consumableSoundFor', () => {
  it('gives every consumable its own pickup cue', () => {
    const keys = CONSUMABLE_KINDS.map(consumableSoundFor);
    for (const [i, kind] of CONSUMABLE_KINDS.entries()) {
      expect(keys[i], kind).toBe(`pickup.${kind}`);
      expect(isSoundKey(keys[i]), kind).toBe(true);
    }
    expect(new Set(keys).size).toBe(CONSUMABLE_KINDS.length);
  });
});

describe('pickup and shield cues (CO-159)', () => {
  it('a shield hit is its own clip, not the player hurt one', () => {
    expect(SOUNDS['shield.hit'].files).not.toEqual(SOUNDS['player.hurt'].files);
  });

  it('burst-prone pickups stay capped at a few starts per short window', () => {
    for (const key of ['progress.gem', 'pickup.ember', 'shield.hit'] as const) {
      expect(SOUNDS[key].maxConcurrent, key).toBeLessThanOrEqual(2);
      expect(SOUNDS[key].minGapMs, key).toBeGreaterThanOrEqual(60);
    }
    for (const key of ['pickup.magnetPull', 'pickup.bombBlast', 'shield.break'] as const)
      expect(SOUNDS[key].maxConcurrent, key).toBe(1);
  });
});

describe('settings defaults', () => {
  it('defaults are full volume, unmuted, under distinct setting keys', () => {
    expect(DEFAULT_AUDIO_SETTINGS).toEqual({ master: 1, sfx: 1, music: 1, muted: false });
    expect(new Set(Object.values(AUDIO_SETTING_KEYS)).size).toBe(4);
    expect(LOW_HEALTH_RATIO).toBeGreaterThan(0);
    expect(LOW_HEALTH_RATIO).toBeLessThan(1);
  });
});
