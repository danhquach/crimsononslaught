import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * CO-156 in the browser: the HP, shield and XP bars are drawn in their
 * pixel-art frames, and with the frames' atlas page missing every bar falls
 * back to the flat placeholder and the run still plays. Ice Shield through
 * `?loadout=` puts the shield bar on screen.
 */
async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1&loadout=ice_shield');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).shieldMax).toBeGreaterThan(0);
}

/** The bar look and the HUD bar art on show, read together so the run cannot step between them. */
function sample(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    // A TileSprite's `frame` is its own canvas; the atlas frame it tiles is
    // `displayFrame`, which Phaser 3.88's typings leave out.
    type Drawn = { visible: boolean; frame?: { name: string }; displayFrame?: { name: string } };
    const frames = hud.children.list
      .map((child) => child as unknown as Drawn)
      .filter((child) => child.visible)
      .map((child) => (child.displayFrame ?? child.frame)?.name ?? '')
      .filter((name) => name.startsWith('hud.'));
    return { look: hud.barLook, frames, hp: hud.view.hp, elapsedMs: hud.view.elapsedMs };
  }, SCENE.hud);
}

test('the HP, shield and XP bars are drawn in their pixel-art frames', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  const { look, frames } = await sample(page);
  expect(look).toBe('art');
  // Three pieces and a mark per bar; the boss bar stays hidden until the boss.
  const pieces = (bar: string) => [
    `hud.${bar}Frame.0.art.l`,
    `hud.${bar}Frame.0.art.m`,
    `hud.${bar}Frame.0.art.r`,
    `hud.${bar}Mark.0.art`,
  ];
  expect(frames).toEqual(['hp', 'shield', 'xp'].flatMap(pieces));

  expect(errors).toEqual([]);
});

test('with the bar frames missing, every bar is the flat bar and the run plays', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  // Phaser logs its own error for the aborted file, so errors are not asserted here.
  await startRun(page);

  const before = await sample(page);
  expect(before.look).toBe('flat');
  expect(before.frames).toEqual([]);
  expect(warnings.some((w) => w.includes('[atlas]') && w.includes('props11.png'))).toBe(true);

  await expect
    .poll(async () => (await sample(page)).elapsedMs, { message: 'the run clock advances' })
    .toBeGreaterThan(before.elapsedMs + 1000);
  expect((await sample(page)).hp).toBeGreaterThan(0);
});
