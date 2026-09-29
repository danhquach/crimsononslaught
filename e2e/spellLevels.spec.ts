import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { SPELL_LEVEL_TEXT_MAX } from '../src/config/spellLevels';
import { SPELL_IDS } from '../src/config/spells';
import { itemInfo } from '../src/core/pauseModel';
import { SCENE, type ResultPayload } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { PauseScene } from '../src/scenes/PauseScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * #326 in the browser: a `?loadout=` link sets each spell's level, the HUD, the
 * pause screen and the result screen show it (gold MAX at level 3), a hostile
 * level is refused whole, and an upgrade card takes a casting spell up a level
 * from the real level-up overlay. What each rule and string is comes from
 * `core/*.test.ts`; this checks the scenes draw them from the real run.
 */
const GOLD = '#ffd700';
const CRIMSON = '#dc143c';
const GREY = '#aaaaaa';
/** A card's text must sit this far inside its frame; Linux CI fonts run taller than the Mac's. */
const SLACK = 8;

async function startRun(page: Page, query: string): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBeGreaterThan(0);
}

/** The Game scene's parts these tests reach into. */
interface Inner {
  spellLevels: { id: string; level: number }[];
  equippedSpellIds: string[];
}

function gameReport(page: Page): Promise<Inner> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(key) as unknown as Inner;
    return { spellLevels: run.spellLevels, equippedSpellIds: run.equippedSpellIds };
  }, SCENE.game);
}

function slotLevels(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).slotLevels;
  }, SCENE.hud);
}

/** The level pills a build strip drew, as (badge text, fill, centre of the disc under it). */
function badgesOf(page: Page, sceneKey: string) {
  return page.evaluate(
    async ([key, fills]) => {
      const { game } = await import('/src/main.ts');
      const texts = game.scene
        .getScene(key)
        .children.list.filter((child) => child.type === 'Text') as unknown as {
        x: number;
        y: number;
        text: string;
        depth: number;
        getData(name: string): string | undefined;
      }[];
      return texts
        .filter((t) => (fills as readonly (string | undefined)[]).includes(t.getData('badgeFill')))
        .map((t) => ({
          text: t.text,
          fill: t.getData('badgeFill'),
          depth: t.depth,
          x: t.x - 14,
          y: t.y - 14,
        }));
    },
    [sceneKey, [GOLD, CRIMSON]] as const,
  );
}

/** Click the pause screen's button by its label, where it is drawn. */
async function clickPauseButton(page: Page, label: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        async ([key, text]) => {
          const { game } = await import('/src/main.ts');
          return game.scene
            .getScene(key)
            .children.list.some(
              (child) => child.type === 'Text' && (child as Phaser.GameObjects.Text).text === text,
            );
        },
        [SCENE.pause, label] as const,
      ),
    )
    .toBe(true);
  const at = await page.evaluate(
    async ([key, text]) => {
      const { game } = await import('/src/main.ts');
      const button = game.scene
        .getScene(key)
        .children.list.find(
          (child) => child.type === 'Text' && (child as Phaser.GameObjects.Text).text === text,
        ) as Phaser.GameObjects.Text;
      return button.getCenter();
    },
    [SCENE.pause, label] as const,
  );
  await page.mouse.click(at.x!, at.y!);
}

const pauseInfo = (page: Page): Promise<string> =>
  page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as PauseScene).nav.info;
  }, SCENE.pause);

test('a ?loadout= link sets each spell’s level: HUD, pause info line and result all show it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, '&loadout=fire:3,fire_meteor:2');

  await expect
    .poll(async () => (await readHud(page)).spells.map(({ id, level }) => ({ id, level })))
    .toEqual([
      { id: 'fire', level: 3 },
      { id: 'fire_meteor', level: 2 },
    ]);
  expect((await gameReport(page)).spellLevels).toEqual([
    { id: 'fire', level: 3 },
    { id: 'fire_meteor', level: 2 },
  ]);
  await expect
    .poll(async () => (await slotLevels(page)).map(({ text, fill }) => ({ text, fill })))
    .toEqual([
      { text: 'MAX', fill: GOLD },
      { text: '2', fill: CRIMSON },
    ]);
  expect(await slotLevels(page)).toMatchObject([
    { id: 'fire', level: 3, maxed: true },
    { id: 'fire_meteor', level: 2, maxed: false },
  ]);

  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  const view = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as PauseScene).view?.view.spells ?? [];
  }, SCENE.pause);
  expect(view.map(({ id, level, maxLevel, maxed }) => ({ id, level, maxLevel, maxed }))).toEqual([
    { id: 'fire', level: 3, maxLevel: 3, maxed: true },
    { id: 'fire_meteor', level: 2, maxLevel: 3, maxed: false },
  ]);

  // The pills on the pause strip, and each disc's info line when pointed at.
  const badges = await badgesOf(page, SCENE.pause);
  expect(badges.map(({ text, fill }) => ({ text, fill }))).toEqual([
    { text: 'MAX', fill: GOLD },
    { text: '2', fill: CRIMSON },
  ]);
  // Lifted over the focus ring (depth 0, #348), so the ring never clips the wide MAX pill.
  expect(badges.map(({ depth }) => depth)).toEqual([1, 1]);
  const heads = [/^Fire Bolt {2}Lv 3\/3 \(max\) {2}— /, /^Meteor {2}Lv 2\/3 {2}— /];
  for (const [i, badge] of badges.entries()) {
    await page.mouse.move(5, 5);
    await page.mouse.move(badge.x, badge.y);
    await expect.poll(() => pauseInfo(page)).toMatch(heads[i]!);
    await expect.poll(() => pauseInfo(page)).toBe(itemInfo(view[i]!));
  }

  // End run: Result reads the same levels, on the same pills.
  await clickPauseButton(page, 'End run');
  await clickPauseButton(page, 'Yes');
  await waitForScene(page, SCENE.result);
  const summary = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as ResultScene).summary as ResultPayload;
  }, SCENE.result);
  expect(summary.build.spells.map(({ id, level }) => ({ id, level }))).toEqual([
    { id: 'fire', level: 3 },
    { id: 'fire_meteor', level: 2 },
  ]);
  expect((await badgesOf(page, SCENE.result)).map(({ text, fill }) => ({ text, fill }))).toEqual([
    { text: 'MAX', fill: GOLD },
    { text: '2', fill: CRIMSON },
  ]);

  expect(errors).toEqual([]);
});

test('a hostile level in the link is refused whole, and the run starts at level 1', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, '&loadout=fire:4,fire_meteor:2.5,fire_column:1e3,ice:%EF%BC%92');
  await expect.poll(async () => (await readHud(page)).spells.length).toBe(1);
  const report = await gameReport(page);
  expect(report.equippedSpellIds).toEqual(['fire']);
  expect(report.spellLevels).toEqual([{ id: 'fire', level: 1 }]);
  await expect
    .poll(async () => (await slotLevels(page)).map(({ text, fill }) => ({ text, fill })))
    .toEqual([{ text: '1', fill: CRIMSON }]);
  expect(errors).toEqual([]);
});

/** What the run's own offer path would build for `fire`, shown on the overlay with a passive beside it. */
function showUpgrade(page: Page, text = 'Lv2 text.'): Promise<{ shown: boolean; pooled: boolean }> {
  return page.evaluate(
    async ([gameKey, words]) => {
      const { game } = await import('/src/main.ts');
      const { offerPool, passiveCard, spellUpgradeCard } =
        await import('/src/core/levelUpOffer.ts');
      const { passiveById } = await import('/src/config/passives.ts');
      const run = game.scene.getScene(gameKey) as unknown as {
        spellLevelTable: Record<string, { 2: string; 3: string }>;
        spells: { loadout: Parameters<typeof passiveCard>[0] };
        offerInput(): Parameters<typeof offerPool>[0];
        castingCards(): Parameters<typeof spellUpgradeCard>[1][];
        showLevelUp(offer: unknown[], fresh: boolean): boolean;
      };
      run.spellLevelTable = { fire: { 2: words, 3: 'Lv3 text.' } };
      const fire = run.castingCards().find((card) => card.id === 'fire')!;
      // Level 1 with both slots full would be the real state; pin it so the run clock cannot move it.
      const pool = offerPool({ ...run.offerInput(), level: 1 });
      const card = spellUpgradeCard(run.spells.loadout, fire, run.spellLevelTable);
      const power = passiveCard(run.spells.loadout, passiveById('passive_power')!);
      return {
        pooled: pool.some((c) => c.id === 'spell_level_fire'),
        shown: run.showLevelUp([card, power], true),
      };
    },
    [SCENE.game, text] as const,
  );
}

/** Every card's rank line, its box, the frame's, the icon's and the description's, in one evaluate. */
function readCards(page: Page) {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const overlay = game.scene.getScene(key) as LevelUpScene;
    return (overlay.children.list as Phaser.GameObjects.Container[])
      .filter((child) => child.type === 'Container')
      .map((card) => {
        type Box = { left: number; right: number; top: number; bottom: number };
        const box = (o: Phaser.GameObjects.Components.GetBounds): Box => {
          const b = o.getBounds();
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
        };
        const texts = card.list.filter((o) => o.type === 'Text') as Phaser.GameObjects.Text[];
        const rank = texts.find((t) => /^(Lv|Rank) /.test(t.text));
        const kind = texts.find((t) => /^(Spell upgrade|Passive)$/.test(t.text));
        const description = texts[texts.length - 1];
        const frame = card.list.find((o) => o.type === 'Rectangle') as
          Phaser.GameObjects.Rectangle | undefined;
        const icon = card.list.find((o) => o.type === 'Image') as
          Phaser.GameObjects.Image | undefined;
        if (!rank || !kind || !description || !frame) return null;
        return {
          rank: rank.text,
          color: String(rank.style.color),
          kind: kind.text,
          description: description.text,
          descriptionLines: description.getWrappedText().length,
          iconFrame: icon?.frame.name ?? null,
          rankBox: box(rank),
          frameBox: box(frame),
          descriptionBox: box(description),
          iconBox: icon ? box(icon) : null,
        };
      })
      .filter((c) => c !== null);
  }, SCENE.levelUp);
}

for (const { level, rank, color, text } of [
  { level: 2, rank: 'Lv 2/3', color: GREY, text: 'Lv2 text.' },
  { level: 3, rank: 'Lv 3/3 · MAX', color: GOLD, text: 'Lv3 text.' },
]) {
  test(`the level ${level} upgrade card reads ${rank} and picking it takes the spell there`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    // Level 3 starts from level 2, the way a run reaches it.
    await startRun(page, level === 3 ? '&loadout=fire:2' : '');
    expect((await gameReport(page)).spellLevels).toEqual([{ id: 'fire', level: level - 1 }]);

    expect(await showUpgrade(page)).toEqual({ pooled: true, shown: true });
    await waitForScene(page, SCENE.levelUp);
    const cards = (await readCards(page)) as NonNullable<
      Awaited<ReturnType<typeof readCards>>[number]
    >[];
    const [upgrade, passive] = cards;
    expect(upgrade).toMatchObject({
      rank,
      color,
      kind: 'Spell upgrade',
      description: text,
      iconFrame: 'icon.fire.0.art',
    });
    expect(passive?.kind).toBe('Passive');
    for (const card of cards) {
      // Rank line inside the frame; the description ends above the bottom edge.
      expect(card.rankBox.left, card.rank).toBeGreaterThanOrEqual(card.frameBox.left + SLACK);
      expect(card.rankBox.right, card.rank).toBeLessThanOrEqual(card.frameBox.right - SLACK);
      expect(card.rankBox.top, card.rank).toBeGreaterThanOrEqual(card.frameBox.top + SLACK);
      expect(card.rankBox.bottom, card.rank).toBeLessThanOrEqual(card.frameBox.bottom - SLACK);
      expect(card.descriptionBox.bottom, card.rank).toBeLessThanOrEqual(
        card.frameBox.bottom - SLACK,
      );
    }
    // The rank line does not run over the icon.
    const { rankBox, iconBox } = upgrade!;
    const overlaps =
      iconBox !== null &&
      rankBox.left < iconBox.right &&
      rankBox.right > iconBox.left &&
      rankBox.top < iconBox.bottom &&
      rankBox.bottom > iconBox.top;
    expect(overlaps, 'rank line over the icon').toBe(false);

    await page.keyboard.press('1');
    await waitForScene(page, SCENE.game);
    await expect
      .poll(async () => (await gameReport(page)).spellLevels)
      .toEqual([{ id: 'fire', level }]);
    await expect
      .poll(async () => (await slotLevels(page)).map(({ text: pill, fill }) => ({ pill, fill })))
      .toEqual([level === 3 ? { pill: 'MAX', fill: GOLD } : { pill: '2', fill: CRIMSON }]);

    if (level === 3) {
      // At the top the spell is out of the pool for good.
      const pooled = await page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        const { offerPool } = await import('/src/core/levelUpOffer.ts');
        const run = game.scene.getScene(key) as unknown as {
          offerInput(): Parameters<typeof offerPool>[0];
        };
        return offerPool({ ...run.offerInput(), level: 1 }).map((card) => card.id);
      }, SCENE.game);
      expect(pooled).not.toContain('spell_level_fire');
    }
    expect(errors).toEqual([]);
  });
}

test('the longest allowed level text fits the card in two lines, clear of the frame', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, '');
  const text = 'Meteors leave a burning pool. '.repeat(3).slice(0, SPELL_LEVEL_TEXT_MAX);
  expect(text).toHaveLength(SPELL_LEVEL_TEXT_MAX);
  expect(await showUpgrade(page, text)).toEqual({ pooled: true, shown: true });
  await waitForScene(page, SCENE.levelUp);
  const [upgrade] = (await readCards(page)) as NonNullable<
    Awaited<ReturnType<typeof readCards>>[number]
  >[];
  expect(upgrade?.description).toBe(text);
  expect(upgrade?.descriptionLines).toBeLessThanOrEqual(2);
  expect(upgrade!.descriptionBox.bottom).toBeLessThanOrEqual(upgrade!.frameBox.bottom - SLACK);
  expect(errors).toEqual([]);
});
