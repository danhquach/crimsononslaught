import { expect, test } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { formatTimer } from '../src/core/hudModel';
import { SCENE } from '../src/core/scenePayloads';
import { cardCenter, collectErrors, readHud, waitForScene } from './game';

/**
 * Spec §8 browser smoke (CO-060): load the page, see SpellSelect, click each
 * spell card, let the run go for 10 s at `?seed=1&timeScale=10`, then check the
 * HUD timer advanced, something died, and the console stayed clean.
 */

for (const [index, spellId] of SPELL_IDS.entries()) {
  test(`boots to SpellSelect and runs ${spellId} for 10 s`, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/?seed=1&timeScale=10');
    await waitForScene(page, SCENE.spellSelect);

    const { x, y } = cardCenter(index);
    await page.mouse.click(x, y);
    await waitForScene(page, SCENE.game);

    // The ticket's window: 10 s of wall clock, 100 s of run time at scale 10.
    await page.waitForTimeout(10_000);

    const hud = await readHud(page);
    expect(formatTimer(hud.elapsedMs)).not.toBe('0:00');
    expect(hud.kills).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
