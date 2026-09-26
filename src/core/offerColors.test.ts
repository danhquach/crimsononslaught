import { describe, expect, it } from 'vitest';
import { ELEMENTS, ROSTER_SPELL_IDS, elementOf } from '../config/loadout';
import { PASSIVES } from '../config/passives';
import { RELIC_BUFFS } from '../config/relics';
import { SPELL_CARDS } from '../config/spells';
import {
  CARD_FILL,
  CARD_FILL_HOVER,
  FALLBACK_COLOR,
  PASSIVE_COLOR,
  RELIC_COLOR,
  cssColor,
  offerColor,
} from './offerColors';

const rgb = (c: number): [number, number, number] => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

/** Straight-line distance between two colours in sRGB, 0–441. */
function distance(a: number, b: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** WCAG 2 contrast ratio, 1–21. */
function contrast(a: number, b: number): number {
  const luminance = (c: number): number => {
    const [r, g, b] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('offerColor', () => {
  it('gives every passive the passive colour and every relic the relic colour', () => {
    for (const { id } of PASSIVES) expect(offerColor('passive', id), id).toBe(PASSIVE_COLOR);
    for (const { id } of RELIC_BUFFS) expect(offerColor('relic', id), id).toBe(RELIC_COLOR);
  });

  it("gives every roster spell its element's colour, not its own", () => {
    for (const id of ROSTER_SPELL_IDS) {
      const element = elementOf(id);
      if (element === undefined) throw new Error(`${id} has no element`);
      expect(offerColor('active', id), id).toBe(SPELL_CARDS[element].color);
    }
  });

  it('falls back to crimson for a spell outside the roster', () => {
    expect(offerColor('active', 'no_such_spell')).toBe(FALLBACK_COLOR);
  });

  it('keeps the kind colours, the elements and crimson at least 100 apart', () => {
    const palette: [string, number][] = [
      ['passive', PASSIVE_COLOR],
      ['relic', RELIC_COLOR],
      ['crimson', FALLBACK_COLOR],
      ...ELEMENTS.map((element): [string, number] => [element, SPELL_CARDS[element].color]),
    ];
    for (const [i, [a, ca]] of palette.entries()) {
      for (const [b, cb] of palette.slice(i + 1)) {
        expect(distance(ca, cb), `${a} vs ${b}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('keeps both kind colours at 3:1 contrast or better on the card, hovered or not', () => {
    for (const color of [PASSIVE_COLOR, RELIC_COLOR]) {
      for (const fill of [CARD_FILL, CARD_FILL_HOVER]) {
        expect(contrast(color, fill), cssColor(color)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('cssColor', () => {
  it('writes a colour as six hex digits', () => {
    expect(cssColor(RELIC_COLOR)).toBe('#9966ff');
    expect(cssColor(0x00a0ff)).toBe('#00a0ff');
  });
});
