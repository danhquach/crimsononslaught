import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * CO-166 in the browser: the arena draws its tiled floor, edge band and props
 * only when the atlas installed, which it does for every page or none (CO-130).
 * With one page missing, even one that isn't the arena's, the arena is the
 * placeholder grid with no props. Fire keeps Chain Lightning's tile sprite out
 * of the Game scene.
 */
async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** The arena's pieces on the Game scene's display list, read in one go. */
function sample(page: Page) {
  return page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as GameScene;
    // A TileSprite's `frame` is its own canvas; the atlas frame it tiles is
    // `displayFrame`, which Phaser 3.88's typings leave out.
    type Drawn = {
      type: string;
      displayFrame?: { name: string };
      children?: { length: number };
    };
    const list = scene.children.list.map((child) => child as unknown as Drawn);
    return {
      tiles: list.filter((c) => c.type === 'TileSprite').map((c) => c.displayFrame?.name ?? ''),
      props: list.filter((c) => c.type === 'Blitter').map((c) => c.children?.length ?? 0),
      grids: list.filter((c) => c.type === 'Grid').length,
    };
  }, SCENE.game);
}

test('with every atlas page loaded, the arena is its tiled art and props', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  const { tiles, props, grids } = await sample(page);
  expect(tiles).toEqual(['arena.ground.0.art', ...Array(4).fill('arena.edge.0.art')]);
  expect(props).toHaveLength(1);
  expect(props[0]).toBeGreaterThan(0);
  expect(grids).toBe(0);

  expect(errors).toEqual([]);
});

test('with one atlas page missing, the arena is the placeholder grid with no props', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  // Not the arena's page (props7): the arena's own page still loads.
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  // Phaser logs its own error for the aborted file, so errors are not asserted here.
  await startRun(page);

  const { tiles, props, grids } = await sample(page);
  expect(tiles).toEqual([]);
  expect(props).toEqual([]);
  expect(grids).toBe(1);
  expect(warnings.some((w) => w.includes('[atlas]') && w.includes('props11.png'))).toBe(true);

  const before = (await readHud(page)).elapsedMs;
  await expect
    .poll(async () => (await readHud(page)).elapsedMs, { message: 'the run clock advances' })
    .toBeGreaterThan(before + 1000);
  expect((await readHud(page)).hp).toBeGreaterThan(0);
});
