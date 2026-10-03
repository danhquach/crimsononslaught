import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { passiveById } from '../src/config/passives';
import { SPELL_IDS } from '../src/config/spells';
import { itemInfo } from '../src/core/pauseModel';
import { SCENE } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { PauseScene } from '../src/scenes/PauseScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * CO-197 in the browser: a passive at its rank cap reads MAX on gold on the HUD
 * and the pause screen, its pause info line shows the cap, and the level-up
 * card that grants its last rank says so. What each string is comes from
 * `core/maxRank.test.ts` and `core/pauseModel.test.ts`; this checks the
 * scenes draw them, from the real loadout.
 */
const SWIFT = 'passive_swift';
const AVARICE = 'passive_avarice';
const POWER = 'passive_power';
/** The caps come from config, so a retune moves the test with it. */
const SWIFT_CAP = passiveById(SWIFT)!.maxRank!;
const AVARICE_CAP = passiveById(AVARICE)!.maxRank!;
const POWER_CAP = passiveById(POWER)!.maxRank!;
const GOLD = '#ffd700';
const CRIMSON = '#dc143c';
/** A card's text must sit this far inside its frame; Linux CI fonts run taller than the Mac's. */
const SLACK = 8;

const BUILD = [
  ...Array.from({ length: SWIFT_CAP }, () => SWIFT),
  ...Array.from({ length: 3 }, () => AVARICE),
  ...Array.from({ length: 3 }, () => POWER),
];

async function startRun(page: Page): Promise<void> {
  await page.goto('/?seed=1&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBeGreaterThan(0);
}

/** Take each id once, in order. */
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

test('the HUD shows MAX on gold for a passive at its cap, and a plain count for the rest', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);

  await takePassives(page, BUILD);
  await expect
    .poll(() => tiles(page))
    .toEqual([
      { id: SWIFT, count: SWIFT_CAP, maxed: true },
      { id: AVARICE, count: 3, maxed: false },
      { id: POWER, count: 3, maxed: false },
    ]);

  // One evaluate: each tile's badge is the Text on its bottom-right corner (+14, +14).
  const badges = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    const texts = hud.children.list.filter((child) => child.type === 'Text') as unknown as {
      x: number;
      y: number;
      text: string;
      getData(key: string): string | undefined;
    }[];
    return hud.passiveTiles.map(({ id, x, y }) => {
      const badge = texts.find((t) => t.x === x + 14 && t.y === y + 14);
      return { id, text: badge?.text, bg: badge?.getData('badgeFill') };
    });
  }, SCENE.hud);
  expect(badges).toEqual([
    { id: SWIFT, text: 'MAX', bg: GOLD },
    { id: AVARICE, text: '3', bg: CRIMSON },
    { id: POWER, text: '3', bg: CRIMSON },
  ]);

  expect(errors).toEqual([]);
});

test('the pause screen shows the same MAX badge, and its info line reads the cap', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await takePassives(page, BUILD);
  await expect.poll(async () => (await tiles(page)).length).toBe(3);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);

  // One evaluate: the view and the badges drawn from it, each with the tile centre under it.
  const read = await page.evaluate(
    async ([key, badgeColors]) => {
      const { game } = await import('/src/main.ts');
      const pause = game.scene.getScene(key) as PauseScene;
      const texts = pause.children.list.filter((child) => child.type === 'Text') as unknown as {
        x: number;
        y: number;
        text: string;
        getData(key: string): string | undefined;
      }[];
      return {
        passives: (pause.view?.view.passives ?? []).map(({ id, count, maxRank, maxed }) => ({
          id,
          count,
          maxRank,
          maxed,
        })),
        badges: texts
          .filter((t) =>
            (badgeColors as readonly (string | undefined)[]).includes(t.getData('badgeFill')),
          )
          .map((t) => ({ text: t.text, bg: t.getData('badgeFill'), x: t.x - 14, y: t.y - 14 })),
      };
    },
    [SCENE.pause, [GOLD, CRIMSON]] as const,
  );
  expect(read.passives).toEqual([
    { id: SWIFT, count: SWIFT_CAP, maxRank: SWIFT_CAP, maxed: true },
    { id: AVARICE, count: 3, maxRank: AVARICE_CAP, maxed: false },
    { id: POWER, count: 3, maxRank: POWER_CAP, maxed: false },
  ]);
  // The Spells strip is above the tiles, so its one level badge (#326) comes first.
  const [spellBadge, ...badges] = read.badges;
  expect(spellBadge).toMatchObject({ text: '1', bg: CRIMSON });
  expect(badges.map(({ text, bg }) => ({ text, bg }))).toEqual([
    { text: 'MAX', bg: GOLD },
    { text: '3', bg: CRIMSON },
    { text: '3', bg: CRIMSON },
  ]);

  // Pointing at each tile reads its line, which is what `itemInfo` says of that passive.
  const expected = [
    {
      id: SWIFT,
      count: SWIFT_CAP,
      maxRank: SWIFT_CAP,
      head: new RegExp(`^Swift {2}${SWIFT_CAP}/${SWIFT_CAP} \\(max\\) {2}— `),
    },
    {
      id: AVARICE,
      count: 3,
      maxRank: AVARICE_CAP,
      head: new RegExp(`^Avarice {2}3/${AVARICE_CAP} {2}— `),
    },
    {
      id: POWER,
      count: 3,
      maxRank: POWER_CAP,
      head: new RegExp(`^Power {2}3/${POWER_CAP} {2}— `),
    },
  ];
  for (const [i, want] of expected.entries()) {
    const at = badges[i]!;
    await page.mouse.move(5, 5);
    await page.mouse.move(at.x, at.y);
    const passive = passiveById(want.id)!;
    const line = itemInfo({
      name: passive.name,
      description: passive.description,
      count: want.count,
      maxRank: want.maxRank,
    });
    await expect
      .poll(async () =>
        page.evaluate(async (key) => {
          const { game } = await import('/src/main.ts');
          return (game.scene.getScene(key) as PauseScene).nav.info;
        }, SCENE.pause),
      )
      .toMatch(want.head);
    await expect
      .poll(async () =>
        page.evaluate(async (key) => {
          const { game } = await import('/src/main.ts');
          return (game.scene.getScene(key) as PauseScene).nav.info;
        }, SCENE.pause),
      )
      .toBe(line);
  }

  expect(errors).toEqual([]);
});

test('the level-up card that grants the last rank reads MAX in gold, and taking it maxes the tile', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await takePassives(
    page,
    Array.from({ length: SWIFT_CAP - 1 }, () => SWIFT),
  );
  await expect.poll(async () => (await tiles(page))[0]?.count).toBe(SWIFT_CAP - 1);

  // Put the three cards on the overlay through the run's own offer path, so a pick is real.
  const offered = await page.evaluate(
    async ([gameKey, ids]) => {
      const { game } = await import('/src/main.ts');
      const { passiveCard } = await import('/src/core/levelUpOffer.ts');
      const { passiveById } = await import('/src/config/passives.ts');
      const run = game.scene.getScene(gameKey) as unknown as {
        spells: { loadout: Parameters<typeof passiveCard>[0] };
        showLevelUp(offer: unknown[], fresh: boolean): boolean;
      };
      const cards = ids.map((id) => passiveCard(run.spells.loadout, passiveById(id)!));
      return run.showLevelUp(cards, true);
    },
    [SCENE.game, [SWIFT, AVARICE, POWER]] as const,
  );
  expect(offered).toBe(true);
  await waitForScene(page, SCENE.levelUp);

  // One evaluate: every card's rank line and the frame it sits in.
  const cards = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const overlay = game.scene.getScene(key) as LevelUpScene;
    return (overlay.children.list as Phaser.GameObjects.Container[])
      .filter((child) => child.type === 'Container')
      .map((card) => {
        const box = (o: Phaser.GameObjects.Components.GetBounds): Phaser.Geom.Rectangle =>
          o.getBounds();
        const rank = card.list.find(
          (o) => o.type === 'Text' && /^Rank /.test((o as Phaser.GameObjects.Text).text),
        ) as Phaser.GameObjects.Text | undefined;
        const frame = card.list.find((o) => o.type === 'Rectangle') as
          Phaser.GameObjects.Rectangle | undefined;
        if (!rank || !frame) return null;
        const r = box(rank);
        const f = box(frame);
        return {
          text: rank.text,
          color: String(rank.style.color),
          rank: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
          frame: { left: f.left, right: f.right, top: f.top, bottom: f.bottom },
        };
      })
      .filter((c) => c !== null);
  }, SCENE.levelUp);
  expect(cards.map((c) => ({ text: c!.text, color: c!.color }))).toEqual([
    { text: `Rank ${SWIFT_CAP}/${SWIFT_CAP} · MAX`, color: GOLD },
    { text: `Rank 1/${AVARICE_CAP}`, color: '#aaaaaa' },
    { text: `Rank 1/${POWER_CAP}`, color: '#aaaaaa' },
  ]);
  for (const { text, rank, frame } of cards as NonNullable<(typeof cards)[number]>[]) {
    expect(rank.left, text).toBeGreaterThanOrEqual(frame.left + SLACK);
    expect(rank.right, text).toBeLessThanOrEqual(frame.right - SLACK);
    expect(rank.top, text).toBeGreaterThanOrEqual(frame.top + SLACK);
    expect(rank.bottom, text).toBeLessThanOrEqual(frame.bottom - SLACK);
  }

  // Taking it maxes the tile on the HUD.
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await expect
    .poll(async () => (await tiles(page))[0])
    .toEqual({ id: SWIFT, count: SWIFT_CAP, maxed: true });

  expect(errors).toEqual([]);
});
