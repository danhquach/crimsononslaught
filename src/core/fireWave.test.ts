import { describe, expect, it } from 'vitest';
import {
  advanceWave,
  inArc,
  newWave,
  sweptThisFrame,
  waveDone,
  waveHeading,
  waveTarget,
} from './fireWave';
import type { Vec2 } from './input';

const DEG = Math.PI / 180;
const HALF = 47.5 * DEG;
const caster = { x: 0, y: 0 };
const at = (deg: number, dist: number) => ({
  x: Math.cos(deg * DEG) * dist,
  y: Math.sin(deg * DEG) * dist,
});

describe('waveTarget', () => {
  const near = { x: 10, y: 0 };
  const far = { x: 100, y: 0 };

  it('picks the nearest enemy within range', () => {
    expect(waveTarget(caster, [far, near], 400)).toBe(near);
  });

  it('ignores an enemy past range', () => {
    expect(waveTarget(caster, [far], 40)).toBeUndefined();
  });

  it('is undefined with no enemies at all', () => {
    expect(waveTarget(caster, [], 400)).toBeUndefined();
  });
});

describe('waveHeading', () => {
  it('points from the caster at the target', () => {
    expect(waveHeading(caster, { x: 10, y: 0 })).toBeCloseTo(0, 9);
    expect(waveHeading(caster, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 9);
    expect(waveHeading({ x: 5, y: 5 }, { x: -5, y: 5 })).toBeCloseTo(Math.PI, 9);
  });
});

describe('inArc', () => {
  it('takes a centre inside the arc and refuses one well outside', () => {
    expect(inArc(caster, 0, HALF, at(0, 100), 0)).toBe(true);
    expect(inArc(caster, 0, HALF, at(30, 100), 0)).toBe(true);
    expect(inArc(caster, 0, HALF, at(-30, 100), 0)).toBe(true);
    expect(inArc(caster, 0, HALF, at(60, 100), 0)).toBe(false);
    expect(inArc(caster, 0, HALF, at(180, 100), 0)).toBe(false);
  });

  it('counts a centre exactly on the ±47.5° edge, and not just past it', () => {
    expect(inArc(caster, 0, HALF, at(47.5, 100), 0)).toBe(true);
    expect(inArc(caster, 0, HALF, at(-47.5, 100), 0)).toBe(true);
    expect(inArc(caster, 0, HALF, at(48, 100), 0)).toBe(false);
  });

  it('counts a body that reaches over the edge though its centre is outside', () => {
    // 5° past the edge at 100 px is about 8.7 px off the edge ray.
    expect(inArc(caster, 0, HALF, at(52.5, 100), 10)).toBe(true);
    expect(inArc(caster, 0, HALF, at(52.5, 100), 8)).toBe(false);
    expect(inArc(caster, 0, HALF, at(-52.5, 100), 10)).toBe(true);
  });

  it('does not reach along the edge line behind the caster', () => {
    // On the edge line extended backwards: 0 px off the line, 100 px from the tip.
    expect(inArc(caster, 0, HALF, at(47.5 + 180, 100), 10)).toBe(false);
  });

  it('wraps angles near ±π', () => {
    expect(inArc(caster, Math.PI, HALF, at(-170, 100), 0)).toBe(true);
    expect(inArc(caster, Math.PI, HALF, at(170, 100), 0)).toBe(true);
    expect(inArc(caster, -Math.PI + 0.1, HALF, at(175, 100), 0)).toBe(true);
    expect(inArc(caster, Math.PI, HALF, at(0, 100), 0)).toBe(false);
  });
});

describe('sweptThisFrame', () => {
  it('takes an enemy inside the band the rim covered', () => {
    expect(sweptThisFrame(90, 100, 95, 0)).toBe(true);
    expect(sweptThisFrame(90, 100, 110, 0)).toBe(false);
    expect(sweptThisFrame(90, 100, 80, 0)).toBe(false);
  });

  it('touches a body as soon as the rim reaches its near edge', () => {
    expect(sweptThisFrame(90, 100, 110, 12)).toBe(true);
    expect(sweptThisFrame(90, 100, 80, 12)).toBe(true);
  });

  it('cannot step over an enemy on a long frame', () => {
    // `?timeScale=10`: one frame moves the rim 45 px.
    expect(sweptThisFrame(40, 85, 60, 0)).toBe(true);
  });
});

describe('advanceWave', () => {
  const body = () => 10;

  it('grows the rim, stops at range and reports done', () => {
    const wave = newWave<Vec2>(caster, 0);
    advanceWave(wave, [], 100, 180, HALF, body);
    expect(wave.r).toBe(100);
    expect(waveDone(wave, 180)).toBe(false);
    advanceWave(wave, [], 100, 180, HALF, body);
    expect(wave.r).toBe(180);
    expect(waveDone(wave, 180)).toBe(true);
  });

  it('hits enemies the rim sweeps inside the arc, and no one outside it', () => {
    const wave = newWave<Vec2>(caster, 0);
    const inside = at(10, 50);
    const edge = at(40, 60);
    const outside = at(90, 50);
    const behind = at(180, 30);
    expect(advanceWave(wave, [inside, edge, outside, behind], 70, 180, HALF, body)).toEqual([
      inside,
      edge,
    ]);
  });

  it('leaves an enemy the rim has not reached yet for a later frame', () => {
    const wave = newWave<Vec2>(caster, 0);
    const far = at(0, 150);
    expect(advanceWave(wave, [far], 100, 180, HALF, body)).toEqual([]);
    expect(advanceWave(wave, [far], 100, 180, HALF, body)).toEqual([far]);
  });

  it('hits an enemy once per wave, however long it stays under the rim', () => {
    const wave = newWave<Vec2>(caster, 0);
    const e = at(0, 20);
    let hits = 0;
    for (let i = 0; i < 20; i += 1) {
      hits += advanceWave(wave, [e], 5, 180, HALF, body).length;
      // It walks along with the rim.
      e.x = wave.r;
    }
    expect(hits).toBe(1);
  });

  it('forgets an enemy that left the crowd, so a pooled respawn can be hit', () => {
    const wave = newWave<Vec2>(caster, 0);
    const e = at(0, 20);
    expect(advanceWave(wave, [e], 30, 180, HALF, body)).toEqual([e]);
    // Killed and gone from the live list for a frame...
    advanceWave(wave, [], 10, 180, HALF, body);
    // ...then the same object is respawned under the rim.
    e.x = wave.r + 5;
    expect(advanceWave(wave, [e], 10, 180, HALF, body)).toEqual([e]);
  });

  it('does not tunnel past an enemy on one long frame', () => {
    const wave = newWave<Vec2>(caster, 0);
    const e = at(0, 60);
    expect(advanceWave(wave, [e], 180, 180, HALF, () => 0)).toEqual([e]);
  });

  it('keeps its own origin, not a live reference to the caster', () => {
    const moving = { x: 0, y: 0 };
    const wave = newWave<Vec2>(moving, 0);
    moving.x = 500;
    expect(wave.origin).toEqual({ x: 0, y: 0 });
  });
});
