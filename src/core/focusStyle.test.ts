import { describe, expect, it } from 'vitest';
import { SPELL_CARDS } from '../config/spells';
import {
  FOCUS_STYLE,
  focusOwner,
  focusRingRects,
  itemLook,
  pulseAlpha,
  ringOutset,
} from './focusStyle';
import { CHARGE_COLOR, PASSIVE_COLOR, RELIC_COLOR } from './offerColors';

const luminance = (c: number): number => {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((c >> 16) & 0xff) +
    0.7152 * channel((c >> 8) & 0xff) +
    0.0722 * channel(c & 0xff)
  );
};

const CRIMSON = 0xdc143c;
const WINE = 0x5a1620;
const box = { x: 100, y: 50, width: 200, height: 40 };

describe('FOCUS_STYLE', () => {
  it('is thick enough to see from across a room, and not a fat frame', () => {
    expect(FOCUS_STYLE.width).toBeGreaterThanOrEqual(3);
    expect(FOCUS_STYLE.width).toBeLessThanOrEqual(4);
  });

  it('is brighter than every colour an item can wear', () => {
    const elements = Object.values(SPELL_CARDS).map((card) => card.color);
    const others = [PASSIVE_COLOR, RELIC_COLOR, CHARGE_COLOR, CRIMSON, WINE, FOCUS_STYLE.halo];
    for (const color of [...elements, ...others]) {
      expect(luminance(FOCUS_STYLE.color), color.toString(16)).toBeGreaterThan(luminance(color));
    }
  });

  it('keeps its keyline darker than the core it separates from the item', () => {
    expect(luminance(FOCUS_STYLE.keyline)).toBeLessThan(luminance(FOCUS_STYLE.color));
  });
});

describe('focusRingRects', () => {
  const rects = focusRingRects(box);
  /** How far a stroked rect's inner and outer edge sit outside `box`. */
  const band = (r: { x: number; lineWidth: number }): [number, number] => {
    const centre = box.x - r.x;
    return [centre - r.lineWidth / 2, centre + r.lineWidth / 2];
  };

  it('lays keyline, core and halo end to end, all outside the box', () => {
    const [keyline, core, halo] = [band(rects.keyline), band(rects.core), band(rects.halo)];
    expect(keyline[0]).toBe(0);
    expect(core[0]).toBe(keyline[1]);
    expect(halo[0]).toBe(core[1]);
    expect(halo[1]).toBe(ringOutset());
    expect(ringOutset()).toBe(6);
  });

  it('grows evenly on every side', () => {
    for (const r of Object.values(rects)) {
      const by = box.x - r.x;
      expect(box.y - r.y).toBe(by);
      expect(r.width).toBe(box.width + 2 * by);
      expect(r.height).toBe(box.height + 2 * by);
    }
  });
});

describe('pulseAlpha', () => {
  it('runs from the dimmest to the brightest and back over one period', () => {
    expect(pulseAlpha(0)).toBeCloseTo(FOCUS_STYLE.haloMin);
    expect(pulseAlpha(0.5)).toBeCloseTo(FOCUS_STYLE.haloMax);
    expect(pulseAlpha(1)).toBeCloseTo(FOCUS_STYLE.haloMin);
    expect(pulseAlpha(0.25)).toBeCloseTo(pulseAlpha(0.75));
  });

  it('stays inside its range', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(pulseAlpha(t)).toBeGreaterThanOrEqual(FOCUS_STYLE.haloMin - 1e-9);
      expect(pulseAlpha(t)).toBeLessThanOrEqual(FOCUS_STYLE.haloMax + 1e-9);
    }
  });
});

describe('itemLook', () => {
  it('raises on hover or focus and rings on focus alone', () => {
    expect(itemLook({ hovered: false, focused: false })).toEqual({ raised: false, ring: false });
    expect(itemLook({ hovered: true, focused: false })).toEqual({ raised: true, ring: false });
    expect(itemLook({ hovered: false, focused: true })).toEqual({ raised: true, ring: true });
    expect(itemLook({ hovered: true, focused: true })).toEqual({ raised: true, ring: true });
  });
});

describe('focusOwner', () => {
  it('hands the ring on, and an old owner hiding late does not take it back', () => {
    const owner = focusOwner<string>();
    expect(owner.current()).toBeNull();
    expect(owner.show('a')).toBe(true);
    expect(owner.show('a')).toBe(false);
    expect(owner.show('b')).toBe(true);
    expect(owner.hide('a')).toBe(false);
    expect(owner.current()).toBe('b');
    expect(owner.hide('b')).toBe(true);
    expect(owner.current()).toBeNull();
  });
});
