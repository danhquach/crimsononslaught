import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/** The atlas under test. FLOOR_CONTRAST_ATLAS points it at another copy, to check the bar against it. */
const ATLAS_DIR =
  process.env.FLOOR_CONTRAST_ATLAS ??
  join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/atlas');

/** name -> { png, frame }, read from the pages themselves so no page assignment is assumed. */
const frames = new Map();
for (const file of readdirSync(ATLAS_DIR).filter((f) => /^props\d*\.json$/.test(f))) {
  const png = PNG.sync.read(readFileSync(join(ATLAS_DIR, file.replace('.json', '.png'))));
  const data = JSON.parse(readFileSync(join(ATLAS_DIR, file), 'utf8'));
  for (const [name, { frame }] of Object.entries(data.frames)) frames.set(name, { png, frame });
}

/** Every visible pixel (alpha 128 or more) of one frame as [r, g, b]. */
function visiblePixels(name) {
  const { png, frame: f } = frames.get(name);
  const out = [];
  for (let y = 0; y < f.h; y += 1) {
    for (let x = 0; x < f.w; x += 1) {
      const i = ((f.y + y) * png.width + f.x + x) * 4;
      if (png.data[i + 3] >= 128) out.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
    }
  }
  return out;
}

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The arena floor, read from `arena.ground.0` in the same atlas: its 90th
 * percentile luma and its mean colour. Nothing about the floor is hard-coded,
 * so a redrawn floor moves the bar with it.
 */
const floor = (() => {
  const px = visiblePixels('arena.ground.0');
  const lumas = px.map(luma).sort((a, b) => a - b);
  return {
    p90: lumas[Math.floor(lumas.length * 0.9)],
    mean: [0, 1, 2].map((c) => px.reduce((sum, p) => sum + p[c], 0) / px.length),
  };
})();

/** How much brighter than the floor's p90 a pixel must be, in luma, to stand out. */
const BRIGHTER_BY = 48;
/** How far from the floor's mean colour a pixel must be, in RGB distance, to stand out. */
const FAR_BY = 100;

/** Share of a frame's visible pixels that stand out from the floor, by brightness or by colour. */
function standsOut(name) {
  const px = visiblePixels(name);
  const out = px.filter(
    (p) =>
      luma(p) >= floor.p90 + BRIGHTER_BY ||
      Math.hypot(...p.map((v, c) => v - floor.mean[c])) >= FAR_BY,
  );
  return out.length / px.length;
}

const clipFrames = (clip) =>
  [...frames.keys()].filter((n) => n.slice(0, n.lastIndexOf('.')) === clip);

/** A clip's worst frame while it moves; its middle one while it fades in or out (first and last are near-floor by design). */
function clipShare(clip, how) {
  const shares = clipFrames(clip)
    .map(standsOut)
    .sort((a, b) => a - b);
  expect(shares.length, `${clip} is in the atlas`).toBeGreaterThan(0);
  return how === 'worst' ? shares[0] : shares[(shares.length - 1) >> 1];
}

const facings = (base) => ['down', 'up', 'left', 'right'].map((f) => `${base}.${f}`);

/**
 * CO-194: dark enemies and pickups vanished into the dark arena floor. Every
 * enemy and pickup clip must have at least this share of its pixels standing
 * out from the floor; the props must have `PROP_MIN`, and stay quieter than
 * every enemy. Calibrated against the pre-CO-194 atlas, where every clip listed
 * below scored under 33% and the controls (swarm, fast, exploder, gem, the
 * hero) scored 40% or more. The clips whose frames already read (the hurt
 * flashes of the splitter, splitling and ranged, the boss's up and down hurt,
 * its death, the splitling's spawn) are not listed: nothing was wrong there.
 * CO-204 adds the shielded enemy's up-facing walk, which scored 22% on main.
 */
const ENEMY_MIN = 0.35;
const PROP_MIN = 0.15;

const moving = [
  ...facings('tank.walk'),
  ...facings('tank.hurt'),
  ...facings('boss.walk'),
  ...facings('boss.charge'),
  ...facings('boss.telegraph'),
  ...facings('boss.slamWindup'),
  ...facings('boss.slam'),
  ...facings('boss.volleyWindup'),
  ...facings('boss.volley'),
  ...facings('boss.summonWindup'),
  ...facings('boss.summon'),
  'boss.hurt.left',
  'boss.hurt.right',
  'splitter.move',
  'splitling.move',
  'ranged.move',
  'shielded.walk.up',
  'pickupBomb.idle',
  'pickupChest.idle',
];
const fading = [
  'tank.spawn',
  'tank.death',
  'splitter.spawn',
  'splitter.death',
  'splitling.death',
  'ranged.spawn',
  'ranged.death',
];
const controls = ['swarm.move', 'fast.move', 'exploder.move', 'gem.idle', ...facings('hero.walk')];
const props = ['arena.tree', 'arena.bush'];

const pct = (share) => `${(share * 100).toFixed(1)}%`;

describe('floor contrast (CO-194)', () => {
  it('reads a floor from the atlas', () => {
    expect(floor.p90).toBeGreaterThan(20);
    expect(floor.p90).toBeLessThan(90);
  });

  for (const [clips, how] of [
    [moving, 'worst'],
    [fading, 'median'],
    [controls, 'worst'],
  ]) {
    for (const clip of clips) {
      it(`${clip} stands out on its ${how} frame (${pct(ENEMY_MIN)} of its pixels or more)`, () => {
        expect(clipShare(clip, how)).toBeGreaterThanOrEqual(ENEMY_MIN);
      });
    }
  }

  const quietest = () =>
    Math.min(
      ...moving.filter((c) => !c.startsWith('pickup')).map((c) => clipShare(c, 'worst')),
      ...fading.map((c) => clipShare(c, 'median')),
    );

  for (const clip of props) {
    it(`${clip} stands out (${pct(PROP_MIN)} or more), and stays quieter than every enemy`, () => {
      const share = clipShare(clip, 'worst');
      expect(share).toBeGreaterThanOrEqual(PROP_MIN);
      expect(share).toBeLessThanOrEqual(quietest());
    });
  }
});
