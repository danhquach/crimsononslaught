import { expect, test } from '@playwright/test';
import { BASE_SPELL_STATS, SPELL_IDS, type SpellId } from '../src/config/spells';
import { formatTimer } from '../src/core/hudModel';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, readHud, waitForScene } from './game';

/**
 * Spec §8 browser smoke (CO-060): load the page, see SpellSelect, click each
 * spell card, let the run go for 10 s at `?seed=1&timeScale=10`, then check the
 * HUD timer advanced, something died, and the console stayed clean.
 *
 * CO-082 adds the overlay check: status overlays follow their enemy and are
 * freed with it, so after the run there are never more of them than live
 * enemies, and a spell whose base stats leave no status has none at all.
 */

/** Whether the unperked spell puts a status on enemies — the only way an overlay appears. */
function baseStatsLeaveStatus(spellId: SpellId): boolean {
  switch (spellId) {
    case 'fire':
      // Burn is Fire Column's identity now (spec §9.2); Fire Bolt leaves none.
      return false;
    case 'ice':
      return BASE_SPELL_STATS.ice.slowPct > 0;
    case 'lightning':
      return BASE_SPELL_STATS.lightning.staggerDuration > 0;
    case 'earth':
      return false;
  }
}

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

    // A run that has already ended (the player can lose inside the window) has
    // stopped Game and its pools with it; there is nothing left to count then.
    // A run paused under the level-up overlay still has them.
    const pools = await page.evaluate(async (gameKey) => {
      const { game } = await import('/src/main.ts');
      if (!game.scene.isActive(gameKey) && !game.scene.isPaused(gameKey)) return null;
      const scene = game.scene.getScene(gameKey) as GameScene;
      return { overlays: scene.overlayCount, enemies: scene.liveEnemyCount };
    }, SCENE.game);
    if (pools) {
      expect(pools.overlays).toBeLessThanOrEqual(pools.enemies);
      if (!baseStatsLeaveStatus(spellId)) expect(pools.overlays).toBe(0);
    }

    expect(errors).toEqual([]);
  });
}
