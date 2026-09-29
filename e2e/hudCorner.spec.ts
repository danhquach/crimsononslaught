import { expect, test, type Page } from '@playwright/test';
import { PASSIVES } from '../src/config/passives';
import { SPELL_IDS } from '../src/config/spells';
import { PASSIVE_TILE_PITCH_X, PASSIVE_TILE_PITCH_Y } from '../src/core/hudCorner';
import { MAX_RANK_CSS } from '../src/core/maxRank';
import { abbreviate } from '../src/core/pauseModel';
import { SCENE } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * CO-193 in the browser: the top-right corner is a plate with the Kills and
 * Embers counts beside their icons and one tile per passive held, wrapping four
 * across, all inside the right margin even for the largest build. With the
 * atlas missing it falls back to the text lines and lettered tiles.
 */
const POWER = 'passive_power';
const HASTE = 'passive_haste';
/** A count badge's crimson; a MAX badge wears `MAX_RANK_CSS` (`buildStrips.ts`). */
const CRIMSON_CSS = '#dc143c';

async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBeGreaterThan(0);
}

/** Take each id once, in order; the loadout is what the HUD's tiles are drawn from. */
function takePassives(page: Page, ids: readonly string[]): Promise<void> {
  return page.evaluate(
    async ([key, taken]) => {
      const { game } = await import('/src/main.ts');
      const { spells } = game.scene.getScene(key) as unknown as {
        spells: { takePassive(id: string): void };
      };
      for (const id of taken) spells.takePassive(id);
    },
    [SCENE.game, ids] as const,
  );
}

function tiles(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    return hud.passiveTiles.map(({ id, count, maxed }) => ({ id, count, maxed }));
  }, SCENE.hud);
}

/** The frames of the HUD's visible images, its text and its kill count, read together. */
function drawn(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    const visible = hud.children.list.filter((child) => (child as { visible?: boolean }).visible);
    return {
      kills: hud.view.kills,
      // Every Graphics, shown or not: each badge's pill is one (CO-197).
      graphics: hud.children.list.filter((child) => child.type === 'Graphics').length,
      frames: visible
        .filter((child) => child.type === 'Image')
        .map((child) => (child as unknown as { frame: { name: string } }).frame.name),
      texts: visible
        .filter((child) => child.type === 'Text')
        .map((child) => (child as unknown as { text: string }).text),
    };
  }, SCENE.hud);
}

test('a passive shows as its icon with its rank, and a rank-up redraws it without a leak', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);

  await takePassives(page, [POWER, POWER, POWER, HASTE]);
  await expect
    .poll(() => tiles(page))
    .toEqual([
      { id: POWER, count: 3, maxed: false },
      { id: HASTE, count: 1, maxed: false },
    ]);

  const passiveFrames = async (): Promise<string[]> =>
    (await drawn(page)).frames.filter((name) => name.startsWith('icon.passive_'));
  expect(await passiveFrames()).toEqual([`icon.${POWER}.0.art`, `icon.${HASTE}.0.art`]);

  // Tiles are rebuilt only when the build changes: while the running Game scene
  // publishes a loadout event every frame, the first tile's icon stays the same live object.
  const steady = await page.evaluate(
    async ([gameKey, hudKey]) => {
      const { game } = await import('/src/main.ts');
      const { RUN_EVENT } = await import('/src/core/runEvents.ts');
      type Icon = { active: boolean; frame: { name: string } };
      const hud = game.scene.getScene(hudKey);
      const firstIcon = (): Icon | undefined =>
        hud.children.list.find(
          (child) =>
            child.type === 'Image' &&
            (child as unknown as Icon).frame.name.startsWith('icon.passive_'),
        ) as unknown as Icon | undefined;
      const before = firstIcon();
      let published = 0;
      const { events } = game.scene.getScene(gameKey);
      const count = (): void => {
        published++;
      };
      events.on(RUN_EVENT.loadout, count);
      const startFrame = game.loop.frame;
      // Wait on real animation frames until the game has stepped ten of its own.
      for (let ticks = 0; game.loop.frame < startFrame + 10 && ticks < 600; ticks++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      events.off(RUN_EVENT.loadout, count);
      const after = firstIcon();
      return {
        sameObject: before !== undefined && before === after,
        active: after?.active ?? false,
        stepped: game.loop.frame - startFrame,
        published,
        paused: game.scene.isPaused(gameKey),
      };
    },
    [SCENE.game, SCENE.hud] as const,
  );
  expect(steady.paused).toBe(false);
  expect(steady.stepped).toBeGreaterThanOrEqual(10);
  expect(steady.published).toBeGreaterThanOrEqual(5);
  expect(steady.sameObject).toBe(true);
  expect(steady.active).toBe(true);

  const corner = await drawn(page);
  expect(corner.frames.filter((name) => name === 'hud.bossMark.0.art')).toHaveLength(1);
  expect(corner.frames).toContain('pickupEmber.idle.0.art');
  // The icons carry Kills and Embers: no words beside them.
  expect(corner.texts.some((text) => text.startsWith('Kills'))).toBe(false);

  await takePassives(page, [POWER]);
  await expect.poll(async () => (await tiles(page))[0]?.count).toBe(4);
  const redrawn = await drawn(page);
  expect(redrawn.frames.filter((name) => name.startsWith('icon.passive_'))).toHaveLength(2);
  // The old tiles' badge pills went with them.
  expect(redrawn.graphics).toBe(corner.graphics);

  expect(errors).toEqual([]);
});

test('the largest build stays inside the right margin, its tiles apart', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  // Every passive once, then Power up to a two-digit rank for the widest badge, and
  // every capped passive up to its cap, so each wears a MAX badge (CO-197).
  const capped = PASSIVES.filter((p) => p.maxRank !== undefined);
  await takePassives(page, [
    ...PASSIVES.map(({ id }) => id),
    ...Array.from({ length: 11 }, () => POWER),
    ...capped.flatMap(({ id, maxRank = 1 }) => Array.from({ length: maxRank - 1 }, () => id)),
  ]);
  await expect.poll(async () => (await tiles(page)).length).toBe(PASSIVES.length);
  await expect.poll(async () => (await tiles(page)).find((t) => t.id === POWER)?.count).toBe(12);
  await expect
    .poll(async () => (await tiles(page)).filter((t) => t.maxed).length)
    .toBe(capped.length);

  const { bounds, tilePositions, timerRight, power, badges, maxBadges, maxedTiles, tenBadges } =
    await page.evaluate(
      async ([hudKey, powerId]) => {
        const { game } = await import('/src/main.ts');
        const hud = game.scene.getScene(hudKey) as HudScene;
        const timer = hud.children.list.find(
          (child) =>
            child.type === 'Text' && /^\d+:\d\d$/.test((child as { text?: string }).text ?? ''),
        );
        // A badge is a Text carrying its `badgeFill`; Kills and Embers are bare Texts.
        const badgesReading = (text: string) =>
          hud.children.list
            .filter((child) => child.type === 'Text' && (child as { text?: string }).text === text)
            .map((child) => {
              const { x, y, width, height } = child as unknown as {
                x: number;
                y: number;
                width: number;
                height: number;
              };
              return { x, y, width, height, bg: child.getData('badgeFill') as string | undefined };
            })
            .filter(({ bg }) => bg !== undefined);
        return {
          bounds: hud.cornerBounds,
          tilePositions: hud.passiveTiles.map(({ x, y }) => ({ x, y })),
          timerRight: (timer as unknown as { getBounds(): { right: number } }).getBounds().right,
          power: hud.passiveTiles.find((tile) => tile.id === powerId),
          badges: badgesReading('12'),
          tenBadges: badgesReading('10').length,
          maxBadges: badgesReading('MAX'),
          maxedTiles: hud.passiveTiles.filter((t) => t.maxed).map(({ x, y }) => ({ x, y })),
        };
      },
      [SCENE.hud, POWER] as const,
    );

  // The "12" is Power's badge, not a count elsewhere that happens to read 12: one Text
  // reads it, on the tile's bottom-right corner (the art tile's badge sits at +14, +14).
  expect(power).toBeDefined();
  expect(badges.map(({ x, y }) => ({ x: x - (power?.x ?? 0), y: y - (power?.y ?? 0) }))).toEqual([
    { x: 14, y: 14 },
  ]);
  // Every capped passive is at its cap: one gold MAX badge on each such tile's corner, no
  // "10" left (Precision's cap reads MAX, not 10).
  expect(maxBadges).toHaveLength(capped.length);
  expect(maxBadges.map(({ x, y }) => ({ x, y })).sort((a, b) => a.y - b.y || a.x - b.x)).toEqual(
    maxedTiles.map(({ x, y }) => ({ x: x + 14, y: y + 14 })).sort((a, b) => a.y - b.y || a.x - b.x),
  );
  for (const badge of maxBadges) expect(badge.bg).toBe(MAX_RANK_CSS);
  for (const badge of badges) expect(badge.bg).toBe(CRIMSON_CSS);
  expect(tenBadges).toBe(0);
  // A badge stays clear of the next tile's disc (radius 18) by 1 px at least (its width
  // follows the font), of the row below's by 2, and inside the canvas's right margin by 8.
  for (const badge of [...badges, ...maxBadges]) {
    const right = badge.x + badge.width / 2;
    const bottom = badge.y + badge.height / 2;
    expect(right).toBeLessThanOrEqual(badge.x - 14 + PASSIVE_TILE_PITCH_X - 18 - 1);
    expect(bottom).toBeLessThanOrEqual(badge.y - 14 + PASSIVE_TILE_PITCH_Y - 18 - 2);
    expect(right).toBeLessThanOrEqual(960 - 8);
  }
  // The corner is inside the canvas's right margin and above the arena's middle.
  expect(bounds.left).toBeGreaterThanOrEqual(736);
  expect(bounds.right).toBeLessThanOrEqual(960);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(270);
  expect(timerRight).toBeLessThan(bounds.left);
  // No two tiles overlap: apart by a tile's width on one axis at least.
  for (const [i, a] of tilePositions.entries()) {
    for (const b of tilePositions.slice(i + 1)) {
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(36);
    }
  }

  expect(errors).toEqual([]);
});

test('the Kills and Embers counts show as bare numbers beside their icons', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  // One evaluate: the run keeps stepping between two, and would move the HUD under a second read.
  const { view, texts } = await page.evaluate(
    async ([gameKey, hudKey]) => {
      const { game } = await import('/src/main.ts');
      const { emitRunEvent } = await import('/src/core/runEvents.ts');
      const { events } = game.scene.getScene(gameKey);
      emitRunEvent(events, 'kill', { kills: 12345 });
      emitRunEvent(events, 'embers', { embers: 42 });
      const hud = game.scene.getScene(hudKey) as HudScene;
      return {
        view: { kills: hud.view.kills, embers: hud.view.embers },
        texts: hud.children.list
          .filter((child) => child.type === 'Text')
          .map((child) => (child as unknown as { text: string }).text),
      };
    },
    [SCENE.game, SCENE.hud] as const,
  );

  expect(view).toEqual({ kills: 12345, embers: 42 });
  expect(texts).toContain('12345');
  expect(texts).toContain('42');

  expect(errors).toEqual([]);
});

test('with the atlas missing, the corner is text lines and lettered tiles', async ({ page }) => {
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  // Phaser logs its own error for the aborted file, so errors are not asserted here.
  await startRun(page);

  await takePassives(page, [POWER, HASTE]);
  await expect.poll(async () => (await tiles(page)).length).toBe(2);

  const { frames, texts, kills } = await drawn(page);
  expect(frames.filter((name) => name.startsWith('icon.passive_'))).toEqual([]);
  expect(texts).toContain(abbreviate('Power'));
  expect(texts).toContain(abbreviate('Haste'));
  expect(texts).toContain(`Kills ${kills}`);

  const bounds = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).cornerBounds;
  }, SCENE.hud);
  expect(bounds.left).toBeGreaterThanOrEqual(736);
});
