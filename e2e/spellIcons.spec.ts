import { expect, test } from '@playwright/test';
import type Phaser from 'phaser';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import {
  cardCenter,
  collectErrors,
  readHud,
  sceneTexts,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * CO-154 in the browser: every casting spell's HUD slot draws its own icon art
 * from the atlas, not the colour-and-letters glyph. One spell per element
 * through the `?loadout=` hook, so each of the four icon sheets is exercised.
 */
const PICKED: SpellId = 'fire';
const EXTRA = ['ice_shield', 'lightning_tornado', 'earth_companion', 'fire_meteor'] as const;

test('each casting spell shows its own icon in its HUD slot', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/?seed=1&invulnerable=1&loadout=${EXTRA.join(',')}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBe(1 + EXTRA.length);

  const icons = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene(hudKey)
      .children.list.map((child) => child as unknown as Phaser.GameObjects.Image)
      .filter((child) => child.type === 'Image' && child.visible)
      .map((child) => child.frame.name)
      .filter((name) => name.startsWith('icon.'));
  }, SCENE.hud);
  expect(icons).toEqual([PICKED, ...EXTRA].map((id) => `icon.${id}.0.art`));

  // With art on show, no slot also draws its letters.
  const glyphs = ['FB', 'IS', 'T', 'EC', 'M'];
  const texts = await sceneTexts(page, SCENE.hud);
  expect(texts.filter((text) => glyphs.includes(text))).toEqual([]);

  expect(errors).toEqual([]);
});
