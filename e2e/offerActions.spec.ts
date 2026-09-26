import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { SPELL_IDS } from '../src/config/spells';
import type { OfferCard } from '../src/core/levelUp';
import type { OfferActions } from '../src/core/offerActions';
import { SCENE } from '../src/core/scenePayloads';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #228 in the browser: a level-up offer carries Reroll (n), Skip and Ban (n)
 * under its cards. Reroll swaps the cards and spends one, Ban removes the
 * chosen card for the run and spends one, Skip closes the offer and pays a
 * reroll, and a button at 0 is greyed out and does nothing. Which cards each
 * draws is `core/levelUpOffer.test.ts`'s; this drives the real overlay.
 */

/** The Game scene's private parts these tests reach into. */
interface Inner {
  pendingLevelUps: number;
  offerActions: OfferActions;
  player: { maxHp: number };
}

interface Snap {
  open: boolean;
  cards: OfferCard[];
  banning: boolean;
  /** The overlay's counts as its buttons show them. */
  shown: { rerolls: number; bans: number } | null;
  /** The run's own counts and bans, read in the same instant. */
  run: { rerolls: number; bans: number; banned: string[] };
  /** Each button label's text and colour. */
  buttons: { text: string; color: string }[];
}

/** Reroll's centre: the first of three 150 px buttons, 20 px apart, centred at y = 504. */
const REROLL_BUTTON = { x: (960 - (3 * 150 + 2 * 20)) / 2 + 75, y: 504 };

async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1&timeScale=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

/** The overlay and the run's counts, read together so they cannot race. */
function snap(page: Page): Promise<Snap> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const { offerActions } = game.scene.getScene(scene.game) as unknown as Inner;
    const run = {
      rerolls: offerActions.rerolls,
      bans: offerActions.bans,
      banned: [...offerActions.banned],
    };
    if (!game.scene.isActive(scene.levelUp)) {
      return { open: false, cards: [], banning: false, shown: null, run, buttons: [] };
    }
    const levelUp = game.scene.getScene(scene.levelUp) as LevelUpScene;
    const buttons = (levelUp.children.list as Phaser.GameObjects.Text[])
      .filter(
        (o) =>
          o.type === 'Text' && /^(Reroll \(\d+\)|Skip \(\+1 reroll\)|Ban \(\d+\))$/.test(o.text),
      )
      .map((o) => ({ text: o.text, color: String(o.style.color) }));
    const { view } = levelUp;
    return {
      open: true,
      cards: [...view.cards],
      banning: view.banning,
      shown: view.actions ?? null,
      run,
      buttons,
    };
  }, SCENE);
}

/** Owe one level-up and wait for its overlay. */
async function openLevelUp(page: Page): Promise<Snap> {
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as unknown as Inner).pendingLevelUps += 1;
  }, SCENE.game);
  let open: Snap | null = null;
  await expect
    .poll(
      async () => {
        const now = await snap(page);
        open = now.open ? now : null;
        return open !== null;
      },
      { message: 'the level-up opened', timeout: 15_000 },
    )
    .toBe(true);
  return open as unknown as Snap;
}

/** Poll until `until` holds on a snapshot, and return that snapshot. */
async function waitFor(page: Page, message: string, until: (s: Snap) => boolean): Promise<Snap> {
  let last: Snap | null = null;
  await expect
    .poll(
      async () => {
        last = await snap(page);
        return until(last);
      },
      { message, timeout: 10_000 },
    )
    .toBe(true);
  return last as unknown as Snap;
}

const ids = (s: Snap): string[] => s.cards.map((c) => c.id);

test('Reroll, Ban and Skip work on the level-up offer and show their counts', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  const first = await openLevelUp(page);
  expect(first.shown).toEqual({ rerolls: 3, bans: 1 });
  expect(first.buttons.map((b) => b.text)).toEqual(['Reroll (3)', 'Skip (+1 reroll)', 'Ban (1)']);
  expect(first.cards).toHaveLength(3);

  // Reroll by key: three new cards, none of those just shown, and one reroll spent.
  await page.keyboard.press('r');
  const rerolled = await waitFor(page, 'the reroll landed', (s) => s.shown?.rerolls === 2);
  expect(rerolled.run.rerolls).toBe(2);
  expect(rerolled.cards).toHaveLength(3);
  for (const id of ids(rerolled)) expect(ids(first)).not.toContain(id);
  expect(rerolled.buttons.map((b) => b.text)).toEqual([
    'Reroll (2)',
    'Skip (+1 reroll)',
    'Ban (1)',
  ]);

  // Reroll by click.
  await page.mouse.click(REROLL_BUTTON.x, REROLL_BUTTON.y);
  const clicked = await waitFor(page, 'the clicked reroll landed', (s) => s.shown?.rerolls === 1);
  expect(ids(clicked)).not.toEqual(ids(rerolled));
  await page.mouse.move(5, 5);

  // Arrows reach the buttons: Left from nothing wakes card 1, Left again wraps
  // to Ban, Enter arms it and Esc disarms it without spending anything.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await waitFor(page, 'ban mode armed', (s) => s.banning);
  await page.keyboard.press('Escape');
  const disarmed = await waitFor(page, 'ban mode cancelled', (s) => !s.banning);
  expect(disarmed.shown).toEqual({ rerolls: 1, bans: 1 });
  expect(ids(disarmed)).toEqual(ids(clicked));

  // Ban the second card: it leaves, the others keep their places, the ban is spent.
  await page.keyboard.press('b');
  await waitFor(page, 'ban mode armed by key', (s) => s.banning);
  const bannedId = ids(disarmed)[1] as string;
  await page.keyboard.press('2');
  const banned = await waitFor(page, 'the ban landed', (s) => s.shown?.bans === 0);
  expect(banned.run.banned).toEqual([bannedId]);
  expect(ids(banned)).not.toContain(bannedId);
  expect(ids(banned)[0]).toBe(ids(disarmed)[0]);
  expect(ids(banned)[2]).toBe(ids(disarmed)[2]);
  expect(banned.banning).toBe(false);

  // Ban at 0 is greyed out and does nothing.
  const banButton = banned.buttons.find((b) => b.text === 'Ban (0)');
  expect(banButton?.color).toBe('#666666');
  await page.keyboard.press('b');
  await page.waitForTimeout(300);
  expect((await snap(page)).banning).toBe(false);

  // Spend the last reroll; at 0 Reroll is greyed out and does nothing.
  await page.keyboard.press('r');
  const empty = await waitFor(page, 'the last reroll landed', (s) => s.shown?.rerolls === 0);
  expect(empty.buttons.find((b) => b.text === 'Reroll (0)')?.color).toBe('#666666');
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  const still = await snap(page);
  expect(ids(still)).toEqual(ids(empty));
  expect(still.run.rerolls).toBe(0);

  // Skip closes the offer and pays a reroll.
  await page.keyboard.press('s');
  const skipped = await waitFor(page, 'the skip closed the offer', (s) => !s.open);
  expect(skipped.run.rerolls).toBe(1);
  await waitForScene(page, SCENE.game);

  // The banned card never comes back this run.
  for (let i = 0; i < 8; i++) {
    const next = await openLevelUp(page);
    expect(ids(next), `level-up ${i + 1}`).not.toContain(bannedId);
    expect(next.shown?.bans).toBe(0);
    await page.keyboard.press('s');
    await waitFor(page, `level-up ${i + 1} skipped`, (s) => !s.open);
  }
  expect((await snap(page)).run.rerolls).toBe(9);
  expect(errors).toEqual([]);
});

test('banning every card left pays the +10 max HP and closes the offer', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  // More bans than the passive pool has cards; only the run's counts change.
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const inner = game.scene.getScene(key) as unknown as Inner;
    inner.offerActions = { ...inner.offerActions, bans: 50 };
  }, SCENE.game);
  const maxHp = (): Promise<number> =>
    page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(key) as unknown as Inner).player.maxHp;
    }, SCENE.game);
  const before = await maxHp();

  let open = await openLevelUp(page);
  const pool = new Set<string>();
  while (open.open) {
    for (const id of ids(open)) pool.add(id);
    const bans = open.shown?.bans ?? 0;
    await page.keyboard.press('b');
    await waitFor(page, 'ban mode armed', (s) => s.banning || !s.open);
    await page.keyboard.press('1');
    open = await waitFor(
      page,
      `ban ${50 - bans + 1} landed`,
      (s) => !s.open || s.shown?.bans === bans - 1,
    );
    expect(open.run.banned.length).toBe(50 - bans + 1);
  }
  const banned = (await snap(page)).run.banned;
  expect(new Set(banned)).toEqual(pool);
  expect(banned.length, 'the whole passive pool').toBeGreaterThan(3);
  await expect.poll(maxHp, { message: 'the +10 max HP landed' }).toBe(before + 10);
  await waitForScene(page, SCENE.game);
  expect(errors).toEqual([]);
});
