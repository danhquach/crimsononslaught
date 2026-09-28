import { describe, expect, it } from 'vitest';
import { buildIconFrame } from './buildIcons';
import { ART_BOXES, FRAMES, FRAME_NAMES } from './frames';
import { PASSIVES } from './passives';
import { RELIC_BUFFS } from './relics';

const IDS = [...PASSIVES, ...RELIC_BUFFS].map((entry) => entry.id);

describe('BUILD_ICON_FRAMES', () => {
  it('gives every passive and relic buff its own icon frame in the atlas', () => {
    const frames = IDS.map((id) => buildIconFrame(id));
    for (const [i, frame] of frames.entries()) {
      expect(frame, IDS[i]).toBeDefined();
      expect(FRAME_NAMES).toContain(frame);
    }
    expect(new Set(frames).size).toBe(IDS.length);
  });

  it('draws every icon 32 px across on its own atlas page, as the spell icons are', () => {
    for (const id of IDS) {
      const box = ART_BOXES[`icon.${id}` as keyof typeof ART_BOXES];
      expect(Math.max(box.w, box.h), id).toBeLessThanOrEqual(32);
      expect(FRAMES[buildIconFrame(id)!].page, id).toBe('props17');
    }
  });
});

describe('buildIconFrame', () => {
  it('finds a passive and a relic, and returns nothing for an unknown id', () => {
    expect(buildIconFrame('passive_power')).toBe('icon.passive_power.0');
    expect(buildIconFrame('relic_sages_tome')).toBe('icon.relic_sages_tome.0');
    expect(buildIconFrame('fire')).toBeUndefined();
    for (const key of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      expect(buildIconFrame(key), key).toBeUndefined();
    }
  });
});
