import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * CO-155 in the browser: every spell-select card and every "New spell"
 * level-up card shows its spell's CO-154 icon at 2x, clear of the card's text,
 * and the cards still pick by mouse and keyboard.
 */

interface Box {
  what: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CardSample {
  icons: { frame: string; width: number; interactive: boolean }[];
  /** The frame's box, then every non-empty text's and image's. */
  frame: Box;
  parts: Box[];
  glyphs: string[];
  /** Spell select's stat rows: the space between each label and its value. */
  statRows: { label: string; gap: number; char: number }[];
}

/** Each card container a scene is showing, as its icons and the boxes of its parts. */
function sampleCards(page: Page, key: string): Promise<CardSample[]> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    const box = (what: string, o: Phaser.GameObjects.Components.GetBounds) => {
      const b = o.getBounds();
      return { what, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const union = (what: string, boxes: Box[]): Box => ({
      what,
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
      top: Math.min(...boxes.map((b) => b.top)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    });
    return game.scene
      .getScene(sceneKey)
      .children.list.filter((child) => child.type === 'Container')
      .map((child) => {
        const list = (child as Phaser.GameObjects.Container).list;
        const images = list.filter(
          (o) => o.type === 'Image',
        ) as unknown as Phaser.GameObjects.Image[];
        const texts = list.filter((o) => o.type === 'Text') as unknown as Phaser.GameObjects.Text[];
        const frame = list[0] as Phaser.GameObjects.Rectangle;
        const labels = texts.filter((text) => text.name === 'statLabel');
        const values = texts.filter((text) => text.name === 'statValue');
        // No icon art: the icon is a disc with the glyph on it, one box here.
        const discs = list.filter((o) => o.type === 'Arc') as unknown as Phaser.GameObjects.Arc[];
        const glyphs =
          discs.length > 0 ? texts.filter((text) => /^[A-Z]{1,2}$/.test(text.text)) : [];
        return {
          icons: images.map((image) => ({
            frame: image.frame.name,
            width: image.displayWidth,
            interactive: image.input !== null,
          })),
          frame: box('frame', frame),
          parts: [
            ...images.map((image) => box(image.frame.name, image)),
            ...texts
              .filter((text) => text.text !== '' && !glyphs.includes(text))
              .map((text) => box(text.text, text)),
            ...(discs.length > 0
              ? [
                  union('fallback icon', [
                    ...discs.map((disc) => box('disc', disc)),
                    ...glyphs.map((text) => box(text.text, text)),
                  ]),
                ]
              : []),
          ],
          glyphs: texts.map((text) => text.text),
          statRows: labels.map((label, i) => ({
            label: label.text,
            gap: (values[i]?.getBounds().left ?? -Infinity) - label.getBounds().right,
            char: label.width / label.text.length,
          })),
        };
      });
  }, key);
}

/** No two parts overlap, and each sits inside the card's frame. */
function expectLaidOut(card: CardSample): void {
  const { frame, parts } = card;
  for (const part of parts) {
    expect(part.left, `${part.what} inside the card`).toBeGreaterThanOrEqual(frame.left);
    expect(part.right, `${part.what} inside the card`).toBeLessThanOrEqual(frame.right);
    expect(part.top, `${part.what} inside the card`).toBeGreaterThanOrEqual(frame.top);
    expect(part.bottom, `${part.what} inside the card`).toBeLessThanOrEqual(frame.bottom);
  }
  for (const [i, a] of parts.entries()) {
    for (const b of parts.slice(i + 1)) {
      const apart =
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `${a.what} clear of ${b.what}`).toBe(true);
    }
  }
}

/** CO-169: every stat row keeps at least one character between its label and value. */
function expectStatGaps(card: CardSample): void {
  expect(card.statRows.length).toBeGreaterThan(0);
  for (const row of card.statRows) {
    expect(row.gap, `${row.label} row gap`).toBeGreaterThanOrEqual(row.char);
  }
}

test('each spell-select card shows its spell icon, clear of its text, and still picks', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const cards = await sampleCards(page, SCENE.spellSelect);
  expect(cards.map((card) => card.icons)).toEqual(
    SPELL_IDS.map((id) => [{ frame: `icon.${id}.0.art`, width: 64, interactive: false }]),
  );
  cards.forEach(expectStatGaps);
  cards.forEach(expectLaidOut);

  const { x, y } = cardCenter(SPELL_IDS.indexOf('ice'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  const equipped = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(gameKey) as GameScene).equippedSpellIds;
  }, SCENE.game);
  expect(equipped).toEqual(['ice']);
  expect(errors).toEqual([]);
});

test('a "New spell" level-up card shows its spell icon, and the key still picks it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Level 2 opens the second slot, so the first level-up offers spells.
  await page.goto('/?seed=1&timeScale=10&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await waitForScene(page, SCENE.levelUp);

  const offer = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(gameKey) as unknown as { offer: { kind: string; id: string }[] })
      .offer;
  }, SCENE.game);
  expect(offer.length).toBeGreaterThan(0);
  expect(offer.every((card) => card.kind === 'active')).toBe(true);

  const cards = await sampleCards(page, SCENE.levelUp);
  expect(cards.map((card) => card.icons)).toEqual(
    offer.map(({ id }) => [{ frame: `icon.${id}.0.art`, width: 64, interactive: false }]),
  );
  cards.forEach(expectLaidOut);

  await page.keyboard.press('1');
  await expect
    .poll(() =>
      page.evaluate(async (gameKey) => {
        const { game } = await import('/src/main.ts');
        return (game.scene.getScene(gameKey) as GameScene).equippedSpellIds;
      }, SCENE.game),
    )
    .toEqual([SPELL_IDS[0], offer[0]?.id]);
  expect(errors).toEqual([]);
});

test('with no icon art, each spell-select card shows its colour-and-letters glyph', async ({
  page,
}) => {
  // The icons' page failing takes every atlas page down with it (CO-130).
  await page.route('**/assets/atlas/props10.png', (route) => route.abort());
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const cards = await sampleCards(page, SCENE.spellSelect);
  expect(cards.map((card) => card.icons)).toEqual(SPELL_IDS.map(() => []));
  for (const card of cards) {
    expect(card.glyphs.some((text) => /^[A-Z]{1,2}$/.test(text))).toBe(true);
    expectStatGaps(card);
    expectLaidOut(card);
  }
});

/** A hand-made passive and relic offer, as the Game scene would launch it (CO-235). */
const BUILD_OFFER = [
  { kind: 'passive', id: 'passive_siphon', name: 'Siphon', description: 'Heals.', rank: 1 },
  {
    kind: 'passive',
    id: 'passive_exploit',
    name: 'Exploit',
    description: 'Hits statused enemies harder.',
    rank: 1,
  },
  { kind: 'relic', id: 'relic_bulwark', name: 'Bulwark', description: 'Guards.', rank: 1 },
] as const;

async function openBuildOffer(page: Page): Promise<CardSample[]> {
  await page.goto('/?seed=1&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await page.evaluate(
    async ([gameKey, levelUpKey, offer]) => {
      const { game } = await import('/src/main.ts');
      game.scene.getScene(gameKey).scene.launch(levelUpKey, { offer });
    },
    [SCENE.game, SCENE.levelUp, BUILD_OFFER] as const,
  );
  await waitForScene(page, SCENE.levelUp);
  return sampleCards(page, SCENE.levelUp);
}

test('a passive or relic level-up card shows its build icon at 2x, clear of its text', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const cards = await openBuildOffer(page);
  expect(cards.map((card) => card.icons)).toEqual(
    BUILD_OFFER.map(({ id }) => [{ frame: `icon.${id}.0.art`, width: 64, interactive: false }]),
  );
  cards.forEach(expectLaidOut);
  // One shared, taller row: the icon band is added to every card.
  expect(new Set(cards.map((card) => card.frame.bottom - card.frame.top)).size).toBe(1);
  expect(cards[0]?.frame.bottom).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('with no icon art, passive and relic level-up cards keep their text-only height', async ({
  page,
}) => {
  // The icons' page failing takes every atlas page down with it (CO-130).
  await page.route('**/assets/atlas/props17.png', (route) => route.abort());
  const cards = await openBuildOffer(page);
  expect(cards.map((card) => card.icons)).toEqual(BUILD_OFFER.map(() => []));
  for (const card of cards) expect(card.frame.bottom - card.frame.top).toBe(260);
  cards.forEach(expectLaidOut);
});
