import { expect, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import type { HudModel } from '../src/core/hudModel';
import { SCENE } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';

/**
 * Helpers shared by the browser suites. Everything they read comes through
 * `game` exported by `src/main.ts`, which the Vite dev server hands back as the
 * very module `index.html` loaded (`tsconfig.e2e.json` maps that URL onto the
 * source file for type-checking).
 */

export function isSceneActive(page: Page, key: string): Promise<boolean> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(sceneKey);
  }, key);
}

/**
 * Polls through `expect.poll`, which awaits the predicate's promise;
 * `page.waitForFunction` would take the pending promise of an async predicate
 * as its truthy result and return at once.
 */
export async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(() => isSceneActive(page, key), { message: `scene ${key} is active`, timeout: 15_000 })
    .toBe(true);
}

/** The HUD's own view-model (`HudScene.view`), not the Game scene's internals. */
export async function readHud(page: Page): Promise<HudModel> {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).view;
  }, SCENE.hud);
}

/**
 * Centre of the i-th spell card in game pixels, mirroring the row layout in
 * `SpellSelectScene` (four 200 px cards, 24 px apart, top edge at y = 150,
 * centred on a 960 px wide canvas). The viewport matches the canvas, so these
 * are page coordinates too; a drifted layout fails the "Game started" wait.
 */
export function cardCenter(index: number): { x: number; y: number } {
  const width = 200;
  const gap = 24;
  const rowWidth = SPELL_IDS.length * width + (SPELL_IDS.length - 1) * gap;
  return { x: (960 - rowWidth) / 2 + width / 2 + index * (width + gap), y: 150 + 280 / 2 };
}

/** `console.error` and uncaught page errors, collected from now on. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
