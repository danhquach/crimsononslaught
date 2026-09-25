import { describe, expect, it } from 'vitest';
import { ART_BOXES, FRAME_NAMES } from './frames';
import { ROSTER_SPELL_IDS } from './loadout';
import { SPELL_ICON_FRAMES, spellIconFrame } from './spellIcons';

describe('SPELL_ICON_FRAMES', () => {
  it('gives every roster spell its own icon frame in the atlas', () => {
    const frames = ROSTER_SPELL_IDS.map((id) => SPELL_ICON_FRAMES[id]);
    for (const [i, frame] of frames.entries()) {
      expect(frame, ROSTER_SPELL_IDS[i]).toBeDefined();
      expect(FRAME_NAMES).toContain(frame);
    }
    expect(new Set(frames).size).toBe(ROSTER_SPELL_IDS.length);
  });

  it('keeps every icon inside the 36 px slot circle', () => {
    for (const id of ROSTER_SPELL_IDS) {
      const box = ART_BOXES[`icon.${id}` as keyof typeof ART_BOXES];
      expect(Math.max(box.w, box.h), id).toBeLessThanOrEqual(32);
    }
  });
});

describe('spellIconFrame', () => {
  it('finds a roster spell and returns nothing for an unknown id', () => {
    expect(spellIconFrame('fire_dragon')).toBe('icon.fire_dragon.0');
    expect(spellIconFrame('not_a_spell')).toBeUndefined();
    expect(spellIconFrame('toString')).toBeUndefined();
  });
});
