import { expect, test, type Page } from '@playwright/test';
import type { PlayerProfile } from '../src/config/passives';
import { RELIC_COUNT } from '../src/config/pickups';
import { relicBuffById } from '../src/config/relics';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import type { OfferCard } from '../src/core/levelUp';
import { SCENE } from '../src/core/scenePayloads';
import type { Spellbook } from '../src/core/spellbook';
import type { Pickup } from '../src/entities/Pickup';
import type { Player } from '../src/entities/Player';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { PickupPool } from '../src/systems/PickupPool';
import { cardCenter, collectErrors, sceneTexts, startFromIntro, waitForScene } from './game';

/**
 * #227 in the browser: touching a relic pauses the run under the level-up
 * overlay with 3 relic buffs, and the pick changes the profile. The player is
 * put on the nearest relic by the test rather than steered 400 px across the
 * arena. What is offered, and how ranks stack, are `core/relicOffer.test.ts`'s
 * and `core/loadout.test.ts`'s.
 */

const PICKED: SpellId = 'fire';

/** The Game scene's private parts these tests reach into. */
interface Inner {
  player: Player;
  pickups: PickupPool;
  spells: Spellbook;
  pendingLevelUps: number;
  onRelic(): void;
}

interface Overlay {
  cards: OfferCard[];
  /** True for a relic's offer: it carries no Reroll or Ban counts, a level-up's does (#228). */
  relicOffer: boolean;
  profile: PlayerProfile;
  relics: [string, number][];
  report: GameScene['pickupReport'];
}

async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1&timeScale=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** The open overlay's cards, or null, with the run's profile and relics from the same instant. */
async function overlay(page: Page): Promise<Overlay | null> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(scene.levelUp)) return null;
    const { view } = game.scene.getScene(scene.levelUp) as LevelUpScene;
    const run = game.scene.getScene(scene.game) as GameScene;
    const { spells } = run as unknown as Inner;
    return {
      cards: [...view.cards],
      relicOffer: view.actions === undefined,
      profile: spells.profile,
      relics: [...spells.loadout.relics],
      report: run.pickupReport,
    };
  }, SCENE);
}

/** Answer level-ups with their first card until a relic's offer is open, and return it. */
async function waitForRelicOffer(page: Page): Promise<Overlay> {
  let found: Overlay | null = null;
  await expect
    .poll(
      async () => {
        const open = await overlay(page);
        if (open?.relicOffer) found = open;
        else if (open) await page.keyboard.press('1');
        return found !== null;
      },
      { message: 'a relic offer opened', timeout: 15_000 },
    )
    .toBe(true);
  return found as unknown as Overlay;
}

test('touching a relic offers 3 relic cards, and a buff pick changes the stat', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);

  // Put the player on the nearest relic.
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const { player, pickups } = game.scene.getScene(key) as unknown as Inner;
    const relics = (pickups.group.getChildren() as Pickup[]).filter(
      (p) => p.active && !p.isCollected && p.kind === 'relic',
    );
    const near = relics.sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
    )[0];
    if (!near) throw new Error('no relic on the floor');
    (player.body as unknown as { reset(x: number, y: number): void }).reset(near.x, near.y);
  }, SCENE.game);

  const offer = await waitForRelicOffer(page);
  expect(offer.cards).toHaveLength(3);
  expect(new Set(offer.cards.map((c) => c.id)).size, 'three different cards').toBe(3);
  // A relic's offer can hold a reroll or ban charge (#228), never a passive or spell.
  for (const card of offer.cards) expect(['relic', 'charge']).toContain(card.kind);
  expect(offer.relics, 'nothing taken before the pick').toEqual([]);
  expect(offer.report.relics, 'the relic is counted').toBe(1);
  expect(offer.report.live.relic, 'the relic left the floor').toBe(RELIC_COUNT - 1);
  const texts = await sceneTexts(page, SCENE.levelUp);
  expect(texts).toContain('Relic found!');

  const at = offer.cards.findIndex((card) => card.kind === 'relic');
  const buff = relicBuffById(offer.cards[at]?.id ?? '');
  if (!buff) throw new Error('the relic offer holds no relic buff');
  const before = offer.profile[buff.field];
  const expected = buff.op === 'mul' ? before * buff.amount : before + buff.amount;

  // The key is handled on the overlay's next frame, not inside `press`.
  await page.keyboard.press(`${at + 1}`);
  let after = { profile: offer.profile, relics: offer.relics };
  await expect
    .poll(
      async () => {
        after = await page.evaluate(async (key) => {
          const { game } = await import('/src/main.ts');
          const { spells } = game.scene.getScene(key) as unknown as Inner;
          return { profile: spells.profile, relics: [...spells.loadout.relics] };
        }, SCENE.game);
        return after.relics;
      },
      { message: 'the pick landed', timeout: 10_000 },
    )
    .toEqual([[buff.id, 1]]);
  expect(after.profile[buff.field], `${buff.name} moved ${buff.field}`).toBeCloseTo(expected, 6);
  expect(errors).toEqual([]);
});

test('a relic and a level-up owed on the same frame are both offered', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  // Record every overlay as it opens, then owe one of each in the same instant.
  // `create` fires on each open because `LevelUpScene.close()` stops the scene;
  // an overlay that slept between opens would need another hook.
  await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const levelUp = game.scene.getScene(scene.levelUp) as LevelUpScene;
    const seen: string[] = [];
    (window as unknown as { overlays: string[] }).overlays = seen;
    levelUp.events.on('create', () => {
      seen.push(levelUp.view.actions === undefined ? 'relic' : 'levelUp');
    });
    const inner = game.scene.getScene(scene.game) as unknown as Inner;
    inner.pendingLevelUps += 1;
    inner.onRelic();
  }, SCENE);

  const seen = async (): Promise<string[]> => {
    if (await overlay(page)) await page.keyboard.press('1');
    return page.evaluate(() => [...(window as unknown as { overlays: string[] }).overlays]);
  };
  await expect
    .poll(async () => (await seen()).includes('relic'), {
      message: 'the relic offer followed',
      timeout: 15_000,
    })
    .toBe(true);
  const order = await seen();
  expect(order[0], 'the level-up goes first').toBe('levelUp');
  expect(order.indexOf('relic'), 'then the relic').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
