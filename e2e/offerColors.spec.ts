import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { SPELL_CARDS } from '../src/config/spells';
import type { OfferCard } from '../src/core/levelUp';
import { PASSIVE_COLOR, RELIC_COLOR, cssColor } from '../src/core/offerColors';
import { SCENE } from '../src/core/scenePayloads';
import type { Pickup } from '../src/entities/Pickup';
import type { Player } from '../src/entities/Player';
import type { PauseScene } from '../src/scenes/PauseScene';
import type { PickupPool } from '../src/systems/PickupPool';
import { collectErrors, startFromIntro, waitForScene } from './game';

/**
 * CO-164 (#253) in the browser: each kind of level-up card wears its own
 * border — a New spell its element's colour, a passive mint, a relic violet —
 * with its kind label in the same colour, and hover thickens the border
 * without changing it. Which colour each kind maps to is
 * `core/offerColors.test.ts`'s; this reads what the overlay actually drew.
 */

const LABELS = ['New spell', 'Passive', 'Relic'];

interface Frame {
  x: number;
  y: number;
  color: number;
  width: number;
}

interface Sample {
  cards: OfferCard[];
  /** Each card's frame, in card order: the overlay's only stroked rectangles. */
  frames: Frame[];
  /** Each card's kind label colour, in card order. */
  labels: string[];
}

/** The open overlay's cards with what it drew for them, read in one go; null when closed. */
function sample(page: Page): Promise<Sample | null> {
  return page.evaluate(
    async ({ key, kinds }) => {
      const { game } = await import('/src/main.ts');
      if (!game.scene.isActive(key)) return null;
      const scene = game.scene.getScene(key);
      const containers = scene.children.list.filter(
        (child) => child.type === 'Container',
      ) as Phaser.GameObjects.Container[];
      const frames = containers.flatMap((box) =>
        (box.list as Phaser.GameObjects.Rectangle[])
          .filter((o) => o.type === 'Rectangle' && o.isStroked)
          .map((o) => ({ x: box.x, y: box.y, color: o.strokeColor, width: o.lineWidth })),
      );
      const labels = containers.flatMap((box) =>
        (box.list as Phaser.GameObjects.Text[])
          .filter((o) => o.type === 'Text' && kinds.includes(o.text))
          .map((o) => String(o.style.color)),
      );
      const { cards } = scene as unknown as { cards: OfferCard[] };
      return { cards, frames, labels };
    },
    { key: SCENE.levelUp, kinds: LABELS },
  );
}

interface PauseSample {
  counts: { spells: number; passives: number; relics: number };
  /** The stroke colour of every stroked shape on the pause screen. */
  rims: number[];
}

/** The pause screen's build and the rims it drew, read in one go; null when closed. */
function samplePause(page: Page): Promise<PauseSample | null> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    if (!game.scene.isActive(key)) return null;
    const scene = game.scene.getScene(key) as PauseScene;
    const view = scene.view?.view;
    if (!view) return null;
    const rims = (scene.children.list as Phaser.GameObjects.Shape[])
      .filter((o) => (o.type === 'Arc' || o.type === 'Rectangle') && o.isStroked)
      .map((o) => o.strokeColor);
    return {
      counts: {
        spells: view.spells.length,
        passives: view.passives.length,
        relics: view.relics.length,
      },
      rims,
    };
  }, SCENE.pause);
}

async function waitForOverlay(page: Page): Promise<Sample> {
  let open: Sample | null = null;
  await expect
    .poll(async () => (open = await sample(page)) !== null, { message: 'an overlay is open' })
    .toBe(true);
  return open as unknown as Sample;
}

/** Every card on the overlay wears `color` at rest, border and label alike. */
function expectWorn(open: Sample, color: number): void {
  expect(open.frames).toHaveLength(open.cards.length);
  expect(open.labels).toHaveLength(open.cards.length);
  for (const frame of open.frames) {
    expect(frame.color, cssColor(frame.color)).toBe(color);
    expect(frame.width).toBe(2);
  }
  for (const label of open.labels) expect(label).toBe(cssColor(color));
}

/** Put the player on the nearest relic still on the floor. */
async function standOnRelic(page: Page): Promise<void> {
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const { player, pickups } = game.scene.getScene(key) as unknown as {
      player: Player;
      pickups: PickupPool;
    };
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
}

test('spell, passive and relic cards each wear their own border, hovered or not', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Level 2 opens the second slot, so the first level-up offers spells.
  await page.goto('/?seed=1&timeScale=10&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1'); // Fire Bolt: a fire run
  await waitForScene(page, SCENE.game);

  const spells = await waitForOverlay(page);
  expect(spells.cards.every((card) => card.kind === 'active')).toBe(true);
  expectWorn(spells, SPELL_CARDS.fire.color);

  // Hover thickens the border and keeps its colour; the other cards stay at rest.
  const [first] = spells.frames;
  if (!first) throw new Error('no card frame');
  await page.mouse.move(first.x, first.y);
  await expect
    .poll(async () => (await sample(page))?.frames.map((f) => [f.color, f.width]))
    .toEqual(spells.frames.map((_, i) => [SPELL_CARDS.fire.color, i === 0 ? 4 : 2]));
  // Off the cards, so the next overlay opens with nothing hovered.
  await page.mouse.move(5, 5);
  await page.keyboard.press('1');

  // Later level-ups offer passives; a relic's offer is all relics. Answer
  // overlays until one of each has been read.
  let passive: Sample | null = null;
  let relic: Sample | null = null;
  await standOnRelic(page);
  await expect
    .poll(
      async () => {
        const open = await sample(page);
        if (open && open.frames.length === open.cards.length) {
          if (open.cards.every((card) => card.kind === 'relic')) relic ??= open;
          else if (open.cards.every((card) => card.kind === 'passive')) passive ??= open;
          await page.keyboard.press('1');
          if (relic === null) await standOnRelic(page).catch(() => undefined);
        }
        return passive !== null && relic !== null;
      },
      { message: 'a passive and a relic overlay were read', timeout: 30_000 },
    )
    .toBe(true);
  expectWorn(passive as unknown as Sample, PASSIVE_COLOR);
  expectWorn(relic as unknown as Sample, RELIC_COLOR);

  // The pause screen's build list wears the same colours: each spell's rim
  // its element's, each passive tile mint, each relic gem violet.
  let build: PauseSample | null = null;
  await expect
    .poll(
      async () => {
        build = await samplePause(page);
        if (build === null) {
          if (await sample(page)) await page.keyboard.press('1');
          else await page.keyboard.press('Escape');
        }
        return build !== null;
      },
      { message: 'the pause screen opened', timeout: 15_000 },
    )
    .toBe(true);
  const { counts, rims } = build as unknown as PauseSample;
  expect(counts.passives).toBeGreaterThan(0);
  expect(counts.relics).toBeGreaterThan(0);
  expect(rims.filter((c) => c === SPELL_CARDS.fire.color)).toHaveLength(counts.spells);
  expect(rims.filter((c) => c === PASSIVE_COLOR)).toHaveLength(counts.passives);
  expect(rims.filter((c) => c === RELIC_COLOR)).toHaveLength(counts.relics);
  expect(errors).toEqual([]);
});
