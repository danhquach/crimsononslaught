import { expect, test, type Page } from '@playwright/test';
import { ARENA_SIZE } from '../src/config/arena';
import { BASE_DASH, DASH_TRAIL, type DashStats } from '../src/config/dash';
import { DASH_ICON } from '../src/config/hud';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import {
  MIN_FPS,
  PAD,
  addFakePad,
  cardCenter,
  collectErrors,
  forceFrameLength,
  frames,
  padPress,
  readHud,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * #384 in the browser: the dash. The rules (distance at any step size, the
 * cooldown, the ready edge, the trail ledger) are `core/dash.test.ts`'s. What
 * only a real run shows is that the key and the pad reach the hero, the burst
 * carries it its distance and stops at the arena edge, the window drops a shot
 * with nothing else in the way, the cue is on for exactly that window, the HUD
 * icon follows the cooldown, and a press made while the run was paused is not
 * a dash.
 *
 * `?enemies=ranged` keeps the melee types out for the first six minutes, so a
 * mobbed hero's 0.5 s immunity cannot hide a failure (the ticket's isolation
 * note). Every reading that has to agree is taken in one evaluate, from inside
 * the game's own step, since separate evaluates race the running game.
 */

const ISOLATED = '&enemies=ranged';
const KEYS = {
  right: { key: 'ArrowRight', x: 1, y: 0 },
  left: { key: 'ArrowLeft', x: -1, y: 0 },
  down: { key: 'ArrowDown', x: 0, y: 1 },
  up: { key: 'ArrowUp', x: 0, y: -1 },
} as const;

interface Point {
  x: number;
  y: number;
}

interface Step {
  state: string;
  tinted: boolean;
  invulnerable: boolean;
}

interface Snap {
  anim: string;
  state: string;
  ghosts: { x: number; y: number; alpha: number; tint: number }[];
  wisps: number;
  puffShown: boolean;
  icon: { ready: boolean; progress: number; art: boolean };
}

interface Track {
  starts: Point[];
  ends: Point[];
  steps: Step[];
  snaps: Snap[];
}

async function startRun(page: Page, query: string, spell: SpellId = 'fire'): Promise<void> {
  await page.goto(`/?seed=1${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(spell));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBeGreaterThan(0);
}

/**
 * Watch the dash from inside the game: each take-off point, the hero's position
 * the step after each burst has finished (before any walking resumes), every
 * `Player.update` step's state and cue, and every frame's trail and HUD icon.
 */
async function trackDash(page: Page): Promise<void> {
  await page.evaluate(
    async ({ game: gameKey, hud: hudKey }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(gameKey) as GameScene;
      const hud = game.scene.getScene(hudKey) as HudScene;
      const player = (
        scene as unknown as { player: { update(d?: number): void; x: number; y: number } }
      ).player;
      const track: Track = { starts: [], ends: [], steps: [], snaps: [] };
      (window as unknown as { __dash: Track }).__dash = track;
      scene.events.on('dash:start', (p: Point) => track.starts.push({ x: p.x, y: p.y }));
      let pendingEnd = false;
      const update = player.update.bind(player);
      player.update = (delta?: number) => {
        // The step after a burst ended: the physics step of its last move has run.
        if (pendingEnd) {
          track.ends.push({ x: player.x, y: player.y });
          pendingEnd = false;
        }
        update(delta);
        const r = scene.dashReport.hero;
        track.steps.push({ state: r.state, tinted: r.tinted, invulnerable: r.invulnerable });
        if (track.starts.length > track.ends.length && r.state !== 'dashing') pendingEnd = true;
      };
      scene.events.on('postupdate', () => {
        if (track.snaps.length > 4000) return;
        const r = scene.dashReport;
        track.snaps.push({
          anim: r.hero.anim,
          state: r.hero.state,
          ghosts: r.ghosts,
          wisps: r.wisps,
          puffShown: r.puffShown,
          icon: hud.dashIconReport,
        });
      });
    },
    { game: SCENE.game, hud: SCENE.hud },
  );
}

function readTrack(page: Page): Promise<Track> {
  return page.evaluate(() => (window as unknown as { __dash: Track }).__dash);
}

function setStats(page: Page, patch: Partial<DashStats>): Promise<void> {
  return page.evaluate(
    async ({ key, patch: p }) => {
      const { game } = await import('/src/main.ts');
      (game.scene.getScene(key) as GameScene).setDashStatsForTest(p);
    },
    { key: SCENE.game, patch },
  );
}

function heroReport(page: Page) {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as GameScene;
    return { dash: scene.dashReport, shots: scene.enemyShotReport };
  }, SCENE.game);
}

/** Wait until the burst `count` has finished and its end position is logged. */
async function endOf(page: Page, count: number): Promise<{ start: Point; end: Point }> {
  await expect
    .poll(async () => (await readTrack(page)).ends.length, { message: `dash ${count} ended` })
    .toBeGreaterThanOrEqual(count);
  const track = await readTrack(page);
  return { start: track.starts[count - 1]!, end: track.ends[count - 1]! };
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

test('a dash carries the hero 120 px, per facing, standing still or moving, with its pose and trail', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, `&timeScale=1${ISOLATED}`);
  await forceFrameLength(page, 16);
  await setStats(page, { cooldownMs: 0 });
  await trackDash(page);

  let count = 0;
  for (const [facing, { key, x, y }] of Object.entries(KEYS)) {
    // Walk a moment to face that way, then stand still: the dash goes where the hero last faced.
    await page.keyboard.down(key);
    await frames(page, 4);
    await page.keyboard.up(key);
    await frames(page, 4);
    const mark = (await readTrack(page)).snaps.length;
    await page.keyboard.press('Space');
    count += 1;
    const { start, end } = await endOf(page, count);
    const dist = distance(start, end);
    console.log(`[dash] ${facing}: ${dist.toFixed(1)} px`);
    expect(dist, `${facing} distance`).toBeGreaterThan(114);
    expect(dist, `${facing} distance`).toBeLessThan(126);
    expect((end.x - start.x) * x + (end.y - start.y) * y, `${facing} direction`).toBeGreaterThan(
      110,
    );

    // One snapshot of everything the dash drew: pose, trail, wisps, puff and icon (#384).
    const snaps = (await readTrack(page)).snaps.slice(mark);
    const dashing = snaps.filter((s) => s.state === 'dashing');
    console.log(
      `[dash] ${facing}: ${dashing.length} dashing frames, ghosts ${Math.max(...snaps.map((s) => s.ghosts.length))}`,
    );
    expect(dashing.length, 'frames spent dashing').toBeGreaterThan(0);
    for (const snap of dashing) expect(snap.anim).toBe(`hero.dash.${facing}`);
    expect(Math.max(...snaps.map((s) => s.ghosts.length))).toBeGreaterThan(0);
    expect(Math.max(...snaps.map((s) => s.ghosts.length))).toBeLessThanOrEqual(DASH_TRAIL.poolSize);
    expect(
      snaps.some((s) => s.puffShown),
      'the take-off puff',
    ).toBe(true);
    expect(Math.max(...snaps.map((s) => s.wisps)), 'wisps over the ghosts').toBeGreaterThan(0);
    for (const ghost of snaps.flatMap((s) => s.ghosts)) {
      expect(ghost.tint).toBe(DASH_TRAIL.ghostTint);
      expect(ghost.alpha).toBeLessThanOrEqual(0.6);
      // On the path: between the take-off and the landing, within a couple of px of the line.
      const along = (ghost.x - start.x) * x + (ghost.y - start.y) * y;
      const off = Math.abs((ghost.x - start.x) * y - (ghost.y - start.y) * x);
      expect(along).toBeGreaterThanOrEqual(-3);
      expect(along).toBeLessThanOrEqual(dist + 3);
      expect(off).toBeLessThan(3);
    }
    // The hero goes back to a walking or idle pose afterwards.
    await expect
      .poll(async () => (await heroReport(page)).dash.hero.anim)
      .toBe(`hero.idle.${facing}`);
    // Let this dash's ghosts fade before the next, so each is read on its own.
    await expect.poll(async () => (await heroReport(page)).dash.ghosts.length).toBe(0);
  }

  // Moving: the held direction, diagonals normalised, so the distance is the same.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await frames(page, 4);
  await page.keyboard.press('Space');
  count += 1;
  const diagonal = await endOf(page, count);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  const dist = distance(diagonal.start, diagonal.end);
  console.log(`[dash] diagonal: ${dist.toFixed(1)} px`);
  expect(dist).toBeGreaterThan(114);
  expect(dist).toBeLessThan(126);
  expect(diagonal.end.x - diagonal.start.x).toBeGreaterThan(70);
  expect(diagonal.end.y - diagonal.start.y).toBeGreaterThan(70);

  // The ghosts fade out and are freed.
  await expect.poll(async () => (await heroReport(page)).dash.ghosts.length).toBe(0);
  expect(errors).toEqual([]);
});

test('the arena edge stops a dash like it stops walking', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, `&timeScale=1${ISOLATED}`);
  await forceFrameLength(page, 16);
  await trackDash(page);

  await page.keyboard.down('ArrowRight');
  await frames(page, 4);
  await page.keyboard.up('ArrowRight');
  await frames(page, 4);
  await page.evaluate(
    async ({ key, x, y }) => {
      const { game } = await import('/src/main.ts');
      (game.scene.getScene(key) as GameScene).placeHeroForTest(x, y);
    },
    { key: SCENE.game, x: ARENA_SIZE.width - 60, y: ARENA_SIZE.height / 2 },
  );
  await frames(page, 2);
  await page.keyboard.press('Space');
  const { start, end } = await endOf(page, 1);
  console.log(`[dash] edge: ${start.x.toFixed(1)} -> ${end.x.toFixed(1)} of ${ARENA_SIZE.width}`);
  expect(end.x).toBeLessThanOrEqual(ARENA_SIZE.width);
  expect(end.x).toBeGreaterThan(start.x);
  expect(end.x - start.x, 'stopped short of the 120 px').toBeLessThan(90);
  expect(Math.abs(end.y - start.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('the cooldown ignores a press, the icon follows it, and the cues play (and mute)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Real time: at timeScale 10 the 3 s cooldown is 0.3 s of wall clock, and a
  // slow CI runner let it run out between the presses (#384).
  await startRun(page, `&timeScale=1${ISOLATED}`);
  await recordSounds(page);
  await trackDash(page);

  // Before any dash: full icon, art drawn, clear of the minimap and the screen edge.
  const before = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    const icon = hud.dashIconReport;
    const own = new Set([...hud.dashIconParts, ...hud.minimapParts]);
    type Box = { left: number; top: number; right: number; bottom: number };
    const hits: string[] = [];
    for (const child of hud.children.list) {
      if (own.has(child) || !(child as { visible?: boolean }).visible) continue;
      if (child.type === 'Graphics') continue;
      const box = (child as unknown as { getBounds(): Box }).getBounds();
      const b = icon.bounds;
      if (box.left < b.right && b.left < box.right && box.top < b.bottom && b.top < box.bottom) {
        hits.push(`${child.type} ${box.left},${box.top},${box.right},${box.bottom}`);
      }
    }
    return { icon, map: hud.minimapReport.bounds, hits };
  }, SCENE.hud);
  expect(before.icon.ready).toBe(true);
  expect(before.icon.progress).toBe(1);
  expect(before.icon.art, 'the cut icon.dash frame, not the ring and glyph').toBe(true);
  expect(before.hits, 'HUD parts under the dash icon').toEqual([]);
  expect(before.icon.bounds.right).toBeLessThan(before.map.left);
  expect(before.icon.bounds.bottom).toBeLessThanOrEqual(540);
  expect(before.icon.bounds.left + (before.icon.bounds.right - before.icon.bounds.left) / 2).toBe(
    DASH_ICON.x,
  );

  await page.keyboard.press('Space');
  await endOf(page, 1);
  // A press while cooling does nothing: no second take-off, no second whoosh.
  await page.keyboard.press('Space');
  await frames(page, 6);
  await page.keyboard.press('Space');
  await frames(page, 6);
  let track = await readTrack(page);
  expect(track.starts, 'take-offs after three presses in one cooldown').toHaveLength(1);
  const cooling = track.snaps.filter((s) => s.state === 'cooldown');
  console.log(`[dash] cooling frames: ${cooling.length}`);
  expect(cooling.length).toBeGreaterThan(0);
  expect(cooling.every((s) => !s.icon.ready)).toBe(true);
  expect(cooling.some((s) => s.icon.progress < 1)).toBe(true);

  // Back to ready: the icon is full again and the ready cue played once.
  await expect
    .poll(async () => (await heroReport(page)).dash.hero.state, { timeout: 15_000 })
    .toBe('ready');
  await frames(page, 3);
  const after = (await readTrack(page)).snaps.at(-1)!;
  expect(after.icon.ready).toBe(true);
  expect(after.icon.progress).toBe(1);
  let sounds = await readSounds(page);
  const dashes = sounds.filter((s) => s.key === 'player.dash');
  console.log(
    `[dash] whoosh requests ${dashes.length}, ready pings ${sounds.filter((s) => s.key === 'player.dashReady').length}`,
  );
  expect(dashes).toHaveLength(1);
  expect(dashes[0]!.started).toBe(true);
  expect(sounds.filter((s) => s.key === 'player.dashReady')).toHaveLength(1);

  // A press after the cooldown works.
  await page.keyboard.press('Space');
  await endOf(page, 2);
  track = await readTrack(page);
  expect(track.starts).toHaveLength(2);

  // Muted: the same cue is asked for and nothing starts.
  await page.keyboard.press('m');
  await expect
    .poll(async () => (await heroReport(page)).dash.hero.state, { timeout: 15_000 })
    .toBe('ready');
  await page.keyboard.press('Space');
  await endOf(page, 3);
  sounds = await readSounds(page);
  const last = sounds.filter((s) => s.key === 'player.dash').at(-1)!;
  expect(sounds.filter((s) => s.key === 'player.dash')).toHaveLength(3);
  expect(last.started, 'a muted whoosh').toBe(false);
  expect(
    sounds.filter((s) => s.key === 'player.dashReady' && s.atMs >= last.atMs && s.started),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('the invulnerability cue is on for exactly the window, and the window is the only shield (#384)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, `&timeScale=10${ISOLATED}`);
  await trackDash(page);
  await page.keyboard.press('Space');
  await endOf(page, 1);
  await frames(page, 4);

  // Every step of the game's own loop: tinted whenever, and only when, the window runs.
  const { steps } = await readTrack(page);
  const first = steps.findIndex((s) => s.invulnerable);
  const run = steps.filter((s) => s.invulnerable).length;
  console.log(`[dash] cue steps ${run} (first at ${first}) of ${steps.length}`);
  expect(first).toBeGreaterThanOrEqual(0);
  for (const [i, step] of steps.entries()) expect(step.tinted, `step ${i}`).toBe(step.invulnerable);
  // One unbroken run of about 200 ms of 16.7 ms steps.
  expect(steps.slice(first, first + run).every((s) => s.invulnerable)).toBe(true);
  expect(run).toBeGreaterThanOrEqual(Math.floor(BASE_DASH.invulnMs / 16.7) - 1);
  expect(run).toBeLessThanOrEqual(Math.ceil(BASE_DASH.invulnMs / 16.7) + 1);
  expect(errors).toEqual([]);
});

test('a lone shot inside the window costs nothing and opens no immunity; one after it costs HP', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, `&timeScale=1${ISOLATED}`);
  await forceFrameLength(page, 16);
  await trackDash(page);

  // The shot goes up on the first step of the window, through the real pool.
  await page.evaluate(
    async ({ key }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      const player = (
        scene as unknown as { player: { update(d?: number): void; endImmunity(): void } }
      ).player;
      player.endImmunity();
      let fired = false;
      const update = player.update.bind(player);
      player.update = (delta?: number) => {
        update(delta);
        if (!fired && scene.dashReport.hero.invulnerable) {
          fired = true;
          (window as unknown as { __fired: boolean }).__fired = scene.fireShotAtHeroForTest(10);
        }
      };
    },
    { key: SCENE.game },
  );
  const start = await heroReport(page);
  expect(start.dash.immune, 'no existing immunity to hide a failure').toBe(false);
  expect(start.dash.hp).toBe(100);

  // Counted from here, so a stray ranged shot before the press cannot skew it.
  const base = await heroReport(page);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await heroReport(page)).shots.hits, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(base.shots.hits + 1);
  const inside = await heroReport(page);
  console.log(
    `[dash] shot in window: hits ${inside.shots.hits - base.shots.hits}, hpLost ${inside.shots.hpLost - base.shots.hpLost}, hp ${inside.dash.hp}, immune ${inside.dash.immune}`,
  );
  expect(inside.shots.hpLost - base.shots.hpLost).toBe(0);
  expect(inside.dash.hp).toBe(base.dash.hp);
  expect(inside.dash.immune, 'the dash did not open the 0.5 s window').toBe(false);

  // After the window a shot costs HP.
  await expect
    .poll(async () => (await heroReport(page)).dash.hero.invulnerable, { timeout: 5_000 })
    .toBe(false);
  expect(
    await page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(key) as GameScene).fireShotAtHeroForTest(10);
    }, SCENE.game),
  ).toBe(true);
  await expect
    .poll(async () => (await heroReport(page)).shots.hits, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(inside.shots.hits + 1);
  const outside = await heroReport(page);
  console.log(
    `[dash] shot after window: hpLost ${outside.shots.hpLost - inside.shots.hpLost}, hp ${outside.dash.hp}`,
  );
  expect(outside.shots.hpLost - inside.shots.hpLost).toBeGreaterThanOrEqual(10);
  expect(outside.dash.hp).toBeLessThanOrEqual(inside.dash.hp - 10);
  expect(errors).toEqual([]);
});

test('a press while paused or on the level-up overlay is no dash, and neither is a held A after resume', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await startRun(page, `&timeScale=1${ISOLATED}`);
  await trackDash(page);
  await frames(page, 4); // the first pad poll only takes a baseline
  const started = async (): Promise<number> => (await readTrack(page)).starts.length;
  const setPad = async (pressed: boolean): Promise<void> => {
    await page.evaluate(
      ([index, down]) => {
        const pad = (
          window as unknown as {
            e2ePad: { timestamp: number; buttons: { pressed: boolean; value: number }[] };
          }
        ).e2ePad;
        pad.buttons[index] = { pressed: down, value: down ? 1 : 0 };
        pad.timestamp = performance.now();
      },
      [PAD.A, pressed] as const,
    );
    await frames(page, 4);
  };

  // Pause: Space is nothing, and an A held across the resume is not a fresh press.
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  await page.keyboard.press('Space');
  await setPad(true);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.game);
  await frames(page, 12);
  console.log(`[dash] dashes after pause with Space and A held: ${await started()}`);
  expect(await started()).toBe(0);
  await setPad(false);
  await frames(page, 4);
  expect(await started(), 'releasing A is no dash either').toBe(0);

  // Level-up: same, picked with a key while A is held.
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as GameScene;
    scene.dropGemsForTest(Math.ceil(scene.xpReport.xpToNext));
  }, SCENE.game);
  await waitForScene(page, SCENE.levelUp);
  await page.keyboard.press('Space');
  await setPad(true);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await frames(page, 12);
  console.log(`[dash] dashes after level-up with Space and A held: ${await started()}`);
  expect(await started()).toBe(0);
  await setPad(false);
  await frames(page, 4);
  expect(await started()).toBe(0);

  // A fresh press now dashes.
  await padPress(page, PAD.A);
  await expect.poll(started).toBe(1);
  expect(errors).toEqual([]);
});

for (const spell of SPELL_IDS) {
  test(`Space and pad A both dash with the ${spell} start`, async ({ page }) => {
    const errors = collectErrors(page);
    await addFakePad(page);
    await startRun(page, `&timeScale=10${ISOLATED}`, spell);
    await trackDash(page);
    await frames(page, 4);

    await page.keyboard.press('Space');
    const viaKey = await endOf(page, 1);
    await expect
      .poll(async () => (await heroReport(page)).dash.hero.state, { timeout: 15_000 })
      .toBe('ready');
    await padPress(page, PAD.A);
    const viaPad = await endOf(page, 2);
    console.log(
      `[dash] ${spell}: key ${distance(viaKey.start, viaKey.end).toFixed(1)} px, pad ${distance(viaPad.start, viaPad.end).toFixed(1)} px`,
    );
    for (const { start, end } of [viaKey, viaPad]) {
      expect(distance(start, end)).toBeGreaterThan(110);
      expect(distance(start, end)).toBeLessThan(130);
    }
    expect(errors).toEqual([]);
  });
}

test('a crowd and a dash held down every step keep the fps floor', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, '&invulnerable=1&timeScale=1');
  await setStats(page, { cooldownMs: 0 });
  const landed = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as GameScene).spawnCrowdForTest(400);
  }, SCENE.game);
  await trackDash(page);
  await page.keyboard.down('ArrowRight');
  const spamUntil = Date.now() + 4_000;
  while (Date.now() < spamUntil) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(40);
  }
  await page.keyboard.up('ArrowRight');
  const fps = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return game.loop.actualFps;
  });
  const track = await readTrack(page);
  console.log(
    `[dash] fps ${fps.toFixed(1)} over ${landed} enemies and ${track.starts.length} dashes (floor ${MIN_FPS})`,
  );
  expect(track.starts.length, 'dashes taken').toBeGreaterThan(5);
  expect(fps).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
