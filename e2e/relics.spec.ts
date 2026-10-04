import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { ARENA_SIZE } from '../src/config/arena';
import type { PlayerProfile } from '../src/config/passives';
import { relicBuffById } from '../src/config/relics';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import type { OfferCard } from '../src/core/levelUp';
import type { OfferActions } from '../src/core/offerActions';
import { relicCountFor } from '../src/core/pickups';
import { SCENE } from '../src/core/scenePayloads';
import type { Spellbook } from '../src/core/spellbook';
import type { Pickup } from '../src/entities/Pickup';
import type { Player } from '../src/entities/Player';
import type { GameScene } from '../src/scenes/GameScene';
import type { LevelUpScene } from '../src/scenes/LevelUpScene';
import type { PickupPool } from '../src/systems/PickupPool';
import {
  PAD,
  addFakePad,
  cardCenter,
  collectErrors,
  frames,
  padPress,
  readSounds,
  recordSounds,
  sceneTexts,
  startFromIntro,
  waitForScene,
} from './game';

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
  offerActions: OfferActions;
  onRelic(): void;
}

interface Overlay {
  cards: OfferCard[];
  /** True for a relic's offer, false for a level-up's. */
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
      relicOffer: view.relic,
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
  await recordSounds(page);

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
  expect(offer.report.live.relic, 'the relic left the floor').toBe(relicCountFor(ARENA_SIZE) - 1);
  const texts = await sceneTexts(page, SCENE.levelUp);
  expect(texts).toContain('Relic found!');
  // CO-159: the touch asked for the relic's own cue.
  const relicCues = (await readSounds(page)).filter((r) => r.key === 'pickup.relic');
  expect(relicCues, 'relic cues').toHaveLength(1);

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
      seen.push(levelUp.view.relic ? 'relic' : 'levelUp');
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

/** A relic offer and the run's counts, read in one instant (CO-239). */
interface RelicSnap {
  open: boolean;
  relicOffer: boolean;
  cards: string[];
  banning: boolean;
  shown: { rerolls: number; bans: number } | null;
  run: { rerolls: number; bans: number; banned: string[] };
  relics: [string, number][];
  relicsFound: number;
  buttons: { text: string; color: string }[];
  /** The subtitle's left and right edges, to check it fits the 960 px screen. */
  hint: { left: number; right: number } | null;
}

function relicSnap(page: Page): Promise<RelicSnap> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(scene.game) as GameScene;
    const { offerActions, spells } = run as unknown as Inner;
    const base = {
      run: {
        rerolls: offerActions.rerolls,
        bans: offerActions.bans,
        banned: [...offerActions.banned],
      },
      relics: [...spells.loadout.relics] as [string, number][],
      relicsFound: run.pickupReport.relics,
    };
    if (!game.scene.isActive(scene.levelUp)) {
      return {
        ...base,
        open: false,
        relicOffer: false,
        cards: [],
        banning: false,
        shown: null,
        buttons: [],
        hint: null,
      };
    }
    const levelUp = game.scene.getScene(scene.levelUp) as LevelUpScene;
    const texts = levelUp.children.list.filter(
      (o): o is Phaser.GameObjects.Text => o.type === 'Text',
    );
    const buttons = texts
      .filter((o) => /^(Reroll \(\d+\)|Skip \(\+1 reroll\)|Ban \(\d+\))$/.test(o.text))
      .map((o) => ({ text: o.text, color: String(o.style.color) }));
    const hintText = texts.find((o) => o.text.startsWith('Choose'));
    const hint = hintText
      ? { left: hintText.getBounds().left, right: hintText.getBounds().right }
      : null;
    const { view } = levelUp;
    return {
      ...base,
      open: true,
      relicOffer: view.relic,
      cards: view.cards.map((c) => c.id),
      banning: view.banning,
      shown: view.actions ?? null,
      buttons,
      hint,
    };
  }, SCENE);
}

async function waitForRelic(page: Page, message: string, until: (s: RelicSnap) => boolean) {
  let last: RelicSnap | null = null;
  await expect
    .poll(
      async () => {
        last = await relicSnap(page);
        return until(last);
      },
      { message, timeout: 10_000 },
    )
    .toBe(true);
  return last as unknown as RelicSnap;
}

/**
 * Owe one relic (counted as found, as a touch is) and wait for its offer. A
 * level-up the live run earns first is answered with its first card, which
 * spends no reroll or ban.
 */
async function oweRelic(page: Page): Promise<RelicSnap> {
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as unknown as Inner).onRelic();
  }, SCENE.game);
  return waitForRelic(page, 'the relic offer opened', (s) => {
    if (s.open && !s.relicOffer) void page.keyboard.press('1');
    return s.open && s.relicOffer;
  });
}

/** Reroll's centre: the first of three 150 px buttons, 20 px apart, centred at y = 504. */
const REROLL_BUTTON = { x: (960 - (3 * 150 + 2 * 20)) / 2 + 75, y: 504 };

test("Reroll, Ban and Skip work on a relic offer and share the run's counts (CO-239)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);

  const first = await oweRelic(page);
  expect(first.shown).toEqual({ rerolls: 3, bans: 1 });
  expect(first.buttons.map((b) => b.text)).toEqual(['Reroll (3)', 'Skip (+1 reroll)', 'Ban (1)']);
  expect(first.cards).toHaveLength(3);
  expect(first.hint, 'the help line').not.toBeNull();
  expect(first.hint?.left ?? -1, 'the help line fits on screen').toBeGreaterThanOrEqual(8);
  expect(first.hint?.right ?? 999, 'the help line fits on screen').toBeLessThanOrEqual(952);
  const texts = await sceneTexts(page, SCENE.levelUp);
  expect(texts).toContain('Relic found!');

  // Reroll by key: three new relic-pool cards, one shared reroll spent.
  await page.keyboard.press('r');
  const rerolled = await waitForRelic(page, 'the reroll landed', (s) => s.shown?.rerolls === 2);
  expect(rerolled.run.rerolls).toBe(2);
  expect(rerolled.relicOffer, 'still a relic offer').toBe(true);
  expect(rerolled.cards).toHaveLength(3);
  for (const id of rerolled.cards) expect(first.cards).not.toContain(id);
  expect(await sceneTexts(page, SCENE.levelUp)).toContain('Relic found!');

  // Reroll by click.
  await page.mouse.click(REROLL_BUTTON.x, REROLL_BUTTON.y);
  const clicked = await waitForRelic(page, 'the clicked reroll', (s) => s.shown?.rerolls === 1);
  expect(clicked.cards).not.toEqual(rerolled.cards);
  await page.mouse.move(5, 5);

  // Ban the first card by key: it leaves, the others keep their places.
  await page.keyboard.press('b');
  await waitForRelic(page, 'ban mode armed', (s) => s.banning);
  await page.keyboard.press('Escape');
  await waitForRelic(page, 'Esc leaves ban mode', (s) => !s.banning);
  await page.keyboard.press('b');
  await waitForRelic(page, 'ban mode armed again', (s) => s.banning);
  const bannedId = clicked.cards[0] as string;
  await page.keyboard.press('1');
  const banned = await waitForRelic(page, 'the ban landed', (s) => s.shown?.bans === 0);
  expect(banned.run.banned).toEqual([bannedId]);
  expect(banned.cards).not.toContain(bannedId);
  expect(banned.cards.slice(1)).toEqual(clicked.cards.slice(1));
  expect(banned.buttons.find((b) => b.text === 'Ban (0)')?.color).toBe('#666666');

  // Skip: no buff, +1 reroll, and the relic still counts as found.
  await page.keyboard.press('s');
  const skipped = await waitForRelic(page, 'the skip closed the offer', (s) => !s.open);
  expect(skipped.run.rerolls).toBe(2);
  expect(skipped.relics, 'no buff taken').toEqual([]);
  expect(skipped.relicsFound, 'the relic counts as found').toBe(1);
  await waitForScene(page, SCENE.game);

  // The banned card never comes back in a relic offer this run.
  for (let i = 0; i < 10; i++) {
    const next = await oweRelic(page);
    expect(next.cards, `relic ${i + 2}`).not.toContain(bannedId);
    await page.keyboard.press('s');
    await waitForRelic(page, `relic ${i + 2} skipped`, (s) => !s.open);
  }
  const end = await relicSnap(page);
  expect(end.relicsFound).toBe(11);
  expect(end.run.rerolls).toBe(12);
  expect(errors).toEqual([]);
});

test('pad X rerolls, Y bans and RB skips a relic offer (CO-239)', async ({ page }) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await startRun(page);
  const first = await oweRelic(page);
  await frames(page, 4); // a fresh overlay baselines its pad first

  await padPress(page, PAD.X);
  const rerolled = await waitForRelic(page, 'the reroll landed', (s) => s.shown?.rerolls === 2);
  expect(rerolled.relicOffer).toBe(true);
  for (const id of rerolled.cards) expect(first.cards).not.toContain(id);
  await frames(page, 4);

  await padPress(page, PAD.Y);
  await waitForRelic(page, 'ban mode on', (s) => s.banning);
  await padPress(page, PAD.B);
  await waitForRelic(page, 'B leaves ban mode', (s) => !s.banning);
  expect((await relicSnap(page)).run.bans).toBe(1);

  await padPress(page, PAD.RB);
  const skipped = await waitForRelic(page, 'the skip closed the offer', (s) => !s.open);
  expect(skipped.run.rerolls).toBe(3);
  expect(skipped.relics).toEqual([]);
  expect(errors).toEqual([]);
});

test('banning the whole relic pool closes the offer with no buff (CO-239)', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const inner = game.scene.getScene(key) as unknown as Inner;
    inner.offerActions = { ...inner.offerActions, bans: 50 };
  }, SCENE.game);

  let open = await oweRelic(page);
  const pool = new Set<string>();
  while (open.open) {
    for (const id of open.cards) pool.add(id);
    const bans = open.shown?.bans ?? 0;
    await page.keyboard.press('b');
    await waitForRelic(page, 'ban mode armed', (s) => s.banning || !s.open);
    await page.keyboard.press('1');
    open = await waitForRelic(
      page,
      `ban ${51 - bans}`,
      (s) => !s.open || s.shown?.bans === bans - 1,
    );
  }
  const end = await relicSnap(page);
  expect(new Set(end.run.banned)).toEqual(pool);
  expect(end.run.banned.length, 'the whole relic pool').toBeGreaterThan(3);
  expect(end.relics, 'no buff taken').toEqual([]);
  expect(end.relicsFound).toBe(1);
  await waitForScene(page, SCENE.game);
  expect(errors).toEqual([]);
});
