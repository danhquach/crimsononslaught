import { describe, expect, it } from 'vitest';

import { ANIMATIONS, STATIC_FRAMES } from './animations';
import { TEXTURE_KEYS } from './colors';
import { FRAMES, FRAME_NAMES } from './frames';

/**
 * The manifest and the atlas are generated artefacts; these tests are the tie
 * that keeps `animations.ts`, which is hand-written, honest about both. If
 * `npm run art:cut` is re-run after a sheet changes and an animation gains or
 * loses a frame, this suite fails rather than the game silently playing a
 * partial loop.
 */
import sheetManifest from '../../docs/art/sheets/manifest.json';

const manifest = sheetManifest as unknown as {
  sheets: {
    key: string;
    rowSpecs: { anim: string; facing?: string; cols: [number, number] }[][];
  }[];
};

/** Frame counts per animation, read straight off the sheet manifest. */
function manifestCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sheet of manifest.sheets) {
    for (const row of sheet.rowSpecs) {
      for (const seg of row) {
        const name = `${sheet.key}.${seg.anim}${seg.facing ? `.${seg.facing}` : ''}`;
        counts.set(name, (counts.get(name) ?? 0) + (seg.cols[1] - seg.cols[0] + 1));
      }
    }
  }
  return counts;
}

describe('animation data (CO-080)', () => {
  it('declares the same frame count as the sheet manifest', () => {
    const fromManifest = manifestCounts();
    const fromAnimations = new Map(ANIMATIONS.map((a) => [a.name, a.frames.length]));

    expect([...fromAnimations.keys()].sort()).toEqual([...fromManifest.keys()].sort());
    for (const [name, count] of fromManifest) {
      expect(fromAnimations.get(name), name).toBe(count);
    }
  });

  it('only references frames that are in the atlas', () => {
    for (const anim of ANIMATIONS) {
      for (const frame of anim.frames) {
        expect(FRAME_NAMES, `${anim.name} -> ${frame}`).toContain(frame);
      }
    }
  });

  it('uses every frame the atlas holds, so nothing is shipped unused', () => {
    const used = new Set(ANIMATIONS.flatMap((a) => a.frames));
    expect([...FRAME_NAMES].filter((f) => !used.has(f))).toEqual([]);
  });

  it('gives each animation a distinct name', () => {
    const names = ANIMATIONS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('plays each animation at a sane rate, looping or once', () => {
    for (const anim of ANIMATIONS) {
      expect(anim.frames.length, anim.name).toBeGreaterThan(0);
      expect(anim.frameRate, anim.name).toBeGreaterThan(0);
      expect(anim.frameRate, anim.name).toBeLessThanOrEqual(30);
      expect([-1, 0], anim.name).toContain(anim.repeat);
    }
  });

  it('lists each animation frame exactly once', () => {
    for (const anim of ANIMATIONS) {
      expect(new Set(anim.frames).size, anim.name).toBe(anim.frames.length);
    }
  });

  it('plays the swarm spawn from the hole outwards, not in drawn order', () => {
    const spawn = ANIMATIONS.find((a) => a.name === 'swarm.spawn');
    expect(spawn?.frames).toEqual([
      'swarm.spawn.3',
      'swarm.spawn.0',
      'swarm.spawn.1',
      'swarm.spawn.2',
    ]);
  });

  it('gives the boss a death that spans both rows of its states sheet', () => {
    expect(ANIMATIONS.find((a) => a.name === 'boss.death')?.frames).toHaveLength(8);
  });

  it('draws every facing from its own art, never a mirrored one', () => {
    // The sheets deliver all four facings for the hero, tank and boss, so no
    // animation is a flipped copy of another (spec §6 lists substitutions that
    // the delivered art made unnecessary; mirroring would put the hero's staff
    // in the wrong hand).
    for (const prefix of ['hero.walk', 'hero.idle', 'tank.walk', 'boss.walk']) {
      const facings = ANIMATIONS.filter((a) => a.name.startsWith(`${prefix}.`));
      expect(facings.map((a) => a.name).sort(), prefix).toEqual([
        `${prefix}.down`,
        `${prefix}.left`,
        `${prefix}.right`,
        `${prefix}.up`,
      ]);
      const frameSets = facings.map((a) => a.frames.join());
      expect(new Set(frameSets).size, prefix).toBe(4);
    }
  });
});

describe('static texture keys', () => {
  it('still covers every key an entity can ask for', () => {
    expect(Object.keys(STATIC_FRAMES).sort()).toEqual([...TEXTURE_KEYS].sort());
  });

  it('resolves every key to a real atlas frame', () => {
    for (const key of TEXTURE_KEYS) {
      expect(FRAME_NAMES, key).toContain(STATIC_FRAMES[key]);
    }
  });

  it('points at the first frame of an idle or move animation', () => {
    for (const key of TEXTURE_KEYS) {
      expect(STATIC_FRAMES[key], key).toMatch(/\.0$/);
    }
  });

  it('gives each key its own frame', () => {
    const frames = Object.values(STATIC_FRAMES);
    expect(new Set(frames).size).toBe(frames.length);
  });
});

describe('generated frame data', () => {
  it('describes every frame with a positive size and an anchor inside it', () => {
    for (const name of FRAME_NAMES) {
      const f = FRAMES[name];
      expect(Number.isInteger(f.w) && f.w > 0, name).toBe(true);
      expect(Number.isInteger(f.h) && f.h > 0, name).toBe(true);
      expect(f.anchorX, name).toBeGreaterThanOrEqual(0);
      expect(f.anchorY, name).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every frame of one animation the same size, so it cannot jitter', () => {
    for (const anim of ANIMATIONS) {
      const sizes = new Set(anim.frames.map((f) => `${FRAMES[f].w}x${FRAMES[f].h}`));
      expect(sizes.size, `${anim.name}: ${[...sizes].join(', ')}`).toBe(1);
    }
  });

  it('puts the anchor at the dead centre of a frame cut from a centred row (CO-097)', () => {
    // `docs/art/sheets/manifest.json` declares the nova row `centred`, which
    // means its crop box is mirrored about the cell centre: the anchor is then
    // the frame's own centre, so the ring is framed symmetrically and keeps
    // clear of the frame edge whatever Reach scales it to.
    for (const name of FRAME_NAMES.filter((f) => f.startsWith('ice.nova.'))) {
      const f = FRAMES[name];
      expect(f.anchorX * 2, `${name} width`).toBe(f.w);
      expect(f.anchorY * 2, `${name} height`).toBe(f.h);
    }
  });

  it('keeps the anchor fixed across an animation', () => {
    for (const anim of ANIMATIONS) {
      const anchors = new Set(anim.frames.map((f) => `${FRAMES[f].anchorX},${FRAMES[f].anchorY}`));
      expect(anchors.size, anim.name).toBe(1);
    }
  });
});
