import { describe, expect, it } from 'vitest';
import { emberPose, makeEmbers, rowLook, type RowState } from './menuStyle';
import { createRng } from './rng';

const idle: RowState = {
  selected: false,
  hovered: false,
  enabled: true,
  active: false,
  dim: false,
};

describe('rowLook', () => {
  it('shows nothing lit at rest, and the button fill when given one', () => {
    expect(rowLook(idle)).toEqual({ lit: false, fillAlpha: 0, text: 'rest' });
    expect(rowLook(idle, 0.35).fillAlpha).toBe(0.35);
  });

  it('lights a selected row over a hovered one', () => {
    const selected = rowLook({ ...idle, selected: true, hovered: true });
    expect(selected).toEqual({ lit: true, fillAlpha: 1, text: 'lit' });
    expect(rowLook({ ...idle, hovered: true }).fillAlpha).toBeLessThan(selected.fillAlpha);
  });

  it('lights a hovered row', () => {
    expect(rowLook({ ...idle, hovered: true })).toEqual({ lit: true, fillAlpha: 0.6, text: 'lit' });
  });

  it('never lights a disabled row by the pointer, and dims its label', () => {
    expect(rowLook({ ...idle, enabled: false, hovered: true })).toEqual({
      lit: false,
      fillAlpha: 0,
      text: 'off',
    });
  });

  it('still shows where the arrows are on a disabled row, without lighting the label', () => {
    expect(rowLook({ ...idle, enabled: false, selected: true })).toEqual({
      lit: true,
      fillAlpha: 0.6,
      text: 'off',
    });
  });

  it('dims an off switch at rest, and lights it like any other row when pointed at', () => {
    expect(rowLook({ ...idle, dim: true }, 0.35)).toEqual({
      lit: false,
      fillAlpha: 0.35 * 0.4,
      text: 'dim',
    });
    expect(rowLook({ ...idle, dim: true }, 0.35)).not.toEqual(rowLook(idle, 0.35));
    expect(rowLook({ ...idle, dim: true, hovered: true })).toEqual(
      rowLook({ ...idle, hovered: true }),
    );
    expect(rowLook({ ...idle, dim: true, selected: true })).toEqual(
      rowLook({ ...idle, selected: true }),
    );
  });

  it('marks the active row apart from a selected one', () => {
    const active = rowLook({ ...idle, active: true });
    expect(active).toEqual({ lit: false, fillAlpha: 0.5, text: 'active' });
    expect(rowLook({ ...idle, active: true, selected: true })).toEqual(
      rowLook({ ...idle, selected: true }),
    );
    expect(active).not.toEqual(rowLook({ ...idle, selected: true }));
  });
});

describe('embers', () => {
  it('are the same for the same seed and differ between seeds', () => {
    expect(makeEmbers(createRng(5), 24, 960, 540)).toEqual(makeEmbers(createRng(5), 24, 960, 540));
    expect(makeEmbers(createRng(5), 24, 960, 540)).not.toEqual(
      makeEmbers(createRng(6), 24, 960, 540),
    );
  });

  it('start on the canvas and rise a fair way', () => {
    for (const e of makeEmbers(createRng(1), 200, 960, 540)) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThan(960);
      expect(e.y).toBeGreaterThan(540 * 0.6);
      expect(e.rise).toBeGreaterThan(540 * 0.35);
    }
  });

  it('fade in from nothing and out to nothing over a climb', () => {
    for (const e of makeEmbers(createRng(2), 50, 960, 540)) {
      expect(emberPose(e, 0, 4).alpha).toBe(0);
      expect(emberPose(e, 1, 4).alpha).toBe(0);
      expect(emberPose(e, 0.5, 4).alpha).toBeGreaterThan(0.5);
      expect(emberPose(e, 0.5, 4).y).toBeLessThan(e.y);
    }
  });

  it('always name a frame that exists', () => {
    for (const e of makeEmbers(createRng(3), 50, 960, 540)) {
      for (let t = 0; t <= 1; t += 0.05) {
        const { frame } = emberPose(e, t, 4);
        expect(Number.isInteger(frame) && frame >= 0 && frame < 4).toBe(true);
      }
    }
  });
});
