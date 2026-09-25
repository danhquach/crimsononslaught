import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  sleetAlpha,
  sleetPiece,
  sleetPose,
  sleetRate,
  spawnsDue,
  spotInDisc,
  stormAlpha,
  type SleetShape,
} from './iceStorm';

const SLEET: SleetShape = {
  velocity: { x: 80, y: 420 },
  speedJitter: 0.15,
  lifeS: 0.3,
  density: 1.5,
  rimFade: 0.35,
};
const CENTRE = { x: 200, y: 100 };

describe('stormAlpha (#219)', () => {
  const fade = { fadeInS: 0.4, fadeOutS: 0.6 };

  it('fades in over the first 0.4 s of the storm', () => {
    expect(stormAlpha(0, 6, fade)).toBe(0);
    expect(stormAlpha(0.2, 5.8, fade)).toBeCloseTo(0.5);
    expect(stormAlpha(0.4, 5.6, fade)).toBe(1);
  });

  it('holds full while the storm rages and fades out over its last 0.6 s', () => {
    expect(stormAlpha(3, 3, fade)).toBe(1);
    expect(stormAlpha(5.7, 0.3, fade)).toBeCloseTo(0.5);
    expect(stormAlpha(6, 0, fade)).toBe(0);
  });

  it('takes the lower of the two on a storm too short for both', () => {
    expect(stormAlpha(0.3, 0.3, fade)).toBeCloseTo(0.5);
  });
});

describe('spawnsDue (#219)', () => {
  it('counts every spawn a window crossed, on the run clock across frames', () => {
    let total = 0;
    for (let t = 0; t < 2; t += 1 / 60) total += spawnsDue(t, 1 / 60, 3);
    expect(total).toBe(6);
  });

  it('owes a long frame every spawn it crossed and a paused one none', () => {
    expect(spawnsDue(0, 1, 3)).toBe(3);
    expect(spawnsDue(1.2, 0, 3)).toBe(0);
    expect(spawnsDue(1.2, -1, 3)).toBe(0);
  });
});

describe('spotInDisc (#219)', () => {
  it('lands every spot inside the disc, all round it', () => {
    const rng = createRng(7);
    const quadrants = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const at = spotInDisc(CENTRE, 68, rng);
      expect(Math.hypot(at.x - CENTRE.x, at.y - CENTRE.y)).toBeLessThanOrEqual(68);
      quadrants.add(`${at.x > CENTRE.x}${at.y > CENTRE.y}`);
    }
    expect(quadrants.size).toBe(4);
  });

  it('replays from a seed', () => {
    expect(spotInDisc(CENTRE, 60, createRng(3))).toEqual(spotInDisc(CENTRE, 60, createRng(3)));
  });
});

describe('sleetRate (#219)', () => {
  it('keeps a storm as thick whatever its radius', () => {
    // 1.5 pieces per 1000 px² over an 80 px storm, each 0.3 s in the air.
    const live = (radius: number) => sleetRate(radius, SLEET) * SLEET.lifeS;
    expect(live(80)).toBeCloseTo((1.5 * Math.PI * 80 * 80) / 1000);
    expect(live(160) / live(80)).toBeCloseTo(4);
    expect(sleetRate(0, SLEET)).toBe(0);
  });
});

describe('sleet pieces (#219)', () => {
  it('falls along the wind, a little faster or slower each, turned along its fall', () => {
    const rng = createRng(11);
    const heading = Math.atan2(SLEET.velocity.y, SLEET.velocity.x);
    const speed = Math.hypot(SLEET.velocity.x, SLEET.velocity.y);
    for (let i = 0; i < 200; i += 1) {
      const piece = sleetPiece(CENTRE, 80, SLEET, 4, rng);
      expect(Math.atan2(piece.vy, piece.vx)).toBeCloseTo(heading);
      expect(piece.rotation).toBeCloseTo(heading);
      const own = Math.hypot(piece.vx, piece.vy);
      expect(own).toBeGreaterThanOrEqual(speed * 0.85 - 1e-9);
      expect(own).toBeLessThanOrEqual(speed * 1.15 + 1e-9);
      expect(piece.frame).toBeGreaterThanOrEqual(0);
      expect(piece.frame).toBeLessThan(4);
      expect(Number.isInteger(piece.frame)).toBe(true);
    }
  });

  it('crosses the storm: halfway through its fall it is inside the patch', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i += 1) {
      const piece = sleetPiece(CENTRE, 80, SLEET, 4, rng);
      const mid = sleetPose(piece, piece.lifeS / 2);
      expect(Math.hypot(mid.x - CENTRE.x, mid.y - CENTRE.y)).toBeLessThanOrEqual(80 + 1e-9);
      const start = sleetPose(piece, 0);
      expect(start.x).toBeCloseTo(piece.x0);
      expect(start.y).toBeCloseTo(piece.y0);
    }
  });

  it('is never seen at or past the radius, so the storm has no drawn edge', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i += 1) {
      const piece = sleetPiece(CENTRE, 80, SLEET, 4, rng);
      for (let t = 0; t <= piece.lifeS; t += piece.lifeS / 20) {
        const at = sleetPose(piece, t);
        const d = Math.hypot(at.x - CENTRE.x, at.y - CENTRE.y);
        const alpha = sleetAlpha(piece, t, CENTRE, 80, SLEET.rimFade);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        if (d >= 80) expect(alpha).toBe(0);
      }
    }
  });

  it('is full deep inside the storm and fades toward the rim and at the ends of its fall', () => {
    const piece = { x0: CENTRE.x, y0: CENTRE.y, vx: 0, vy: 0, lifeS: 0.3, rotation: 0, frame: 0 };
    expect(sleetAlpha(piece, 0.15, CENTRE, 80, 0.35)).toBe(1);
    expect(sleetAlpha(piece, 0, CENTRE, 80, 0.35)).toBe(0);
    expect(sleetAlpha(piece, 0.3, CENTRE, 80, 0.35)).toBe(0);
    const nearRim = { ...piece, x0: CENTRE.x + 66 };
    expect(sleetAlpha(nearRim, 0.15, CENTRE, 80, 0.35)).toBeCloseTo(0.5);
  });
});
