import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { ROSTER_SPELL_IDS } from '../src/config/loadout';
import { PASSIVES } from '../src/config/passives';
import { RELIC_BUFFS } from '../src/config/relics';
import { ROSTER_SPELL_CARDS } from '../src/config/rosterCards';
import { PASSIVE_COLOR, RELIC_COLOR } from '../src/core/offerColors';
import { INFO_HINT, abbreviate, itemInfo } from '../src/core/pauseModel';
import type { PauseFocus } from '../src/core/pauseNav';
import { RESULT_HEADLINES, RESULT_LAYOUT, resultView } from '../src/core/resultModel';
import {
  MAX_BUILD_COUNT,
  SCENE,
  type Outcome,
  type ResultPayload,
} from '../src/core/scenePayloads';
import type { ResultControls, ResultScene } from '../src/scenes/ResultScene';
import { collectErrors, focusRing, isSceneActive, waitForScene } from './game';
import { expectRingReadable } from './ringProbe';

/**
 * #290 in the browser: the result screen holds the largest build the game
 * allows without pushing "Play again" or "Main menu" off the 960×540 screen,
 * on every outcome, and still starts exactly one SpellSelect or one Intro. It
 * is started directly with a crafted payload; the real way in (End run from
 * pause) is `pause.spec.ts`'s, and a full Victory is `fullRun.spec.ts`'s.
 */

const WIDTH = 960;
const HEIGHT = 540;
/** CI's fonts render taller than a Mac's; keep this much clear of every edge. */
const SLACK = 8;

/** Every passive at its top rank, every relic stacked to the cap, and all three spell slots at level 3. */
function maxedPayload(outcome: Outcome): ResultPayload {
  return {
    outcome,
    stats: {
      timeSurvivedMs: 15 * 60_000,
      level: 99,
      kills: 99_999,
      spellId: 'lightning',
      embers: 9_999,
      consumables: 40,
      relics: RELIC_BUFFS.length,
    },
    build: {
      spells: [
        { id: 'lightning', name: 'Lightning Bolt', color: 0xffee55, level: 3 },
        { id: 'lightning_companion', name: 'Lightning Companion', color: 0x88ccff, level: 3 },
        { id: 'lightning_tornado', name: 'Tornado', color: 0x88ccff, level: 3 },
      ],
      passives: PASSIVES.map((passive) => [
        passive.id as ResultPayload['build']['passives'][number][0],
        passive.maxRank ?? MAX_BUILD_COUNT,
      ]),
      relics: RELIC_BUFFS.map((buff) => [
        buff.id as ResultPayload['build']['relics'][number][0],
        MAX_BUILD_COUNT,
      ]),
    },
    earned: 9_999,
    balance: 999_999,
  };
}

/** Let the page draw `n` frames. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = (left: number): void => {
          if (left <= 0) resolve();
          else requestAnimationFrame(() => tick(left - 1));
        };
        tick(count);
      }),
    n,
  );
}

/** Boot, then start Result straight from Intro with `payload`, counting every SpellSelect start. */
async function openResult(page: Page, payload: object): Promise<void> {
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.evaluate(
    async ({ scene, payload }) => {
      const { game } = await import('/src/main.ts');
      const counter = window as unknown as { spellSelectStarts: number; introStarts: number };
      counter.spellSelectStarts = 0;
      counter.introStarts = 0;
      game.scene.getScene(scene.spellSelect).events.on('create', () => {
        counter.spellSelectStarts += 1;
      });
      game.scene.getScene(scene.intro).events.on('create', () => {
        counter.introStarts += 1;
      });
      game.scene.stop(scene.intro);
      game.scene.start(scene.result, payload);
    },
    { scene: SCENE, payload },
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Sample {
  summary: Readonly<ResultPayload> | null;
  controls: Readonly<ResultControls> | null;
  headline: { text: string; color: string } | null;
  passiveTiles: Box[];
  relicGems: Box[];
  /** The build icons' rims (CO-179), by the strip's colour. */
  passiveIcons: Box[];
  relicIcons: Box[];
  /** Every `icon.*` frame an image on the screen shows. */
  iconFrames: string[];
  /** The rank and stack badges' count, gold MAX ones included. */
  badges: number;
  /** The gold MAX badges (CO-197). */
  maxBadges: number;
  /** Every text on the screen, with its bounds. */
  texts: { text: string; box: Box }[];
}

/** Everything a check compares, read in one evaluate. */
function sample(page: Page): Promise<Sample> {
  return page.evaluate(
    async ({ scene, headlines, passiveColor, relicColor }) => {
      const { game } = await import('/src/main.ts');
      const result = game.scene.getScene(scene.result) as ResultScene;
      const list = result.children.list;
      const box = (o: { getBounds(): Phaser.Geom.Rectangle }): Box => {
        const b = o.getBounds();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      const rects = list.filter((o) => o.type === 'Rectangle') as Phaser.GameObjects.Rectangle[];
      const texts = list.filter((o) => o.type === 'Text') as Phaser.GameObjects.Text[];
      // A build icon's black disc has radius TILE / 2 + 2 = 18; a spell's is 19 (`buildStrips.ts`).
      const rims = (color: number): Box[] =>
        (list as Phaser.GameObjects.Arc[])
          .filter(
            (o) =>
              o.type === 'Arc' && o.fillColor === 0 && o.radius === 18 && o.strokeColor === color,
          )
          .map(box);
      const head = texts.find((t) => headlines.includes(t.text));
      return {
        summary: result.summary,
        controls: result.controls,
        headline: head ? { text: head.text, color: head.style.color as string } : null,
        // The tile faces' fills (`buildStrips.ts`).
        passiveTiles: rects.filter((r) => r.fillColor === 0x241a14).map(box),
        relicGems: rects.filter((r) => r.fillColor === 0x4a1030).map(box),
        passiveIcons: rims(passiveColor),
        relicIcons: rims(relicColor),
        iconFrames: (list as Phaser.GameObjects.Image[])
          .filter((o) => o.type === 'Image' && o.frame.name.startsWith('icon.'))
          .map((o) => o.frame.name),
        // A badge's Text carries its fill (`buildStrips.ts`).
        badges: texts.filter((t) => ['#dc143c', '#ffd700'].includes(t.getData('badgeFill'))).length,
        maxBadges: texts.filter((t) => t.text === 'MAX' && t.getData('badgeFill') === '#ffd700')
          .length,
        texts: texts.map((t) => ({ text: t.text, box: box(t) })),
      };
    },
    {
      scene: SCENE,
      headlines: Object.values(RESULT_HEADLINES).map((h) => h.text),
      passiveColor: PASSIVE_COLOR,
      relicColor: RELIC_COLOR,
    },
  );
}

const within = (b: Box, slack: number): boolean =>
  b.x >= slack &&
  b.y >= slack &&
  b.x + b.width <= WIDTH - slack &&
  b.y + b.height <= HEIGHT - slack;

/** Every passive and relic face sits on screen above the button with its badge. */
function expectBuildAboveButton(s: Sample, passives: Box[], relics: Box[]): void {
  expect(passives).toHaveLength(PASSIVES.length);
  expect(relics).toHaveLength(RELIC_BUFFS.length);
  // Each spell wears a level badge too (#326), gold MAX at level 3.
  const spells = s.summary?.build.spells ?? [];
  expect(s.badges).toBe(PASSIVES.length + RELIC_BUFFS.length + spells.length);
  expect(s.maxBadges).toBe(
    PASSIVES.filter((p) => p.maxRank !== undefined).length +
      spells.filter((spell) => spell.level === 3).length,
  );
  const buttonTop = s.controls?.button.y ?? 0;
  for (const face of [...passives, ...relics]) {
    expect(within(face, SLACK), JSON.stringify(face)).toBe(true);
    expect(face.y + face.height).toBeLessThan(buttonTop);
  }
}

const buildFrames = [...PASSIVES, ...RELIC_BUFFS].map(({ id }) => `icon.${id}.0.art`);

const spellSelectStarts = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { spellSelectStarts: number }).spellSelectStarts);
const introStarts = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { introStarts: number }).introStarts);

const HINT = 'click, press Enter, or gamepad A · Esc or B for the main menu';

for (const outcome of ['win', 'lose', 'ended'] as const) {
  test(`${outcome}: a maxed build keeps Play again, Main menu and their hint on screen`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openResult(page, maxedPayload(outcome));
    await waitForScene(page, SCENE.result);
    await frames(page, 4);
    const s = await sample(page);
    await page.screenshot({ path: test.info().outputPath(`result-${outcome}.png`) });

    expect(s.summary?.outcome).toBe(outcome);
    expect(s.headline).toEqual({
      text: RESULT_HEADLINES[outcome].text,
      color: RESULT_HEADLINES[outcome].color,
    });
    expect(s.texts.map((t) => t.text)).toContain(RESULT_HEADLINES[outcome].subtitle);

    const { button, menuButton, hint } = s.controls ?? {};
    expect(button && within(button, SLACK), JSON.stringify(button)).toBe(true);
    expect(menuButton && within(menuButton, SLACK), JSON.stringify(menuButton)).toBe(true);
    expect(hint && within(hint, SLACK), JSON.stringify(hint)).toBe(true);
    expect(button).toEqual(RESULT_LAYOUT.button);
    expect(menuButton).toEqual(RESULT_LAYOUT.menuButton);
    for (const text of ['Play again', 'Main menu']) {
      const label = s.texts.find((t) => t.text === text);
      expect(label && within(label.box, SLACK), text).toBe(true);
    }
    // The hint's text box is where it draws, however tall CI's font makes it.
    const hintText = s.texts.find((t) => t.text === HINT);
    expect(hintText && within(hintText.box, SLACK)).toBe(true);

    // Every passive and relic wears its icon art (CO-179), not its letters, all above the button.
    expectBuildAboveButton(s, s.passiveIcons, [...s.relicIcons, ...s.relicGems]);
    for (const frame of buildFrames) expect(s.iconFrames, frame).toContain(frame);
    expect(s.passiveTiles).toEqual([]);
    expect(s.relicGems).toEqual([]);
    // No text overflows the screen either.
    for (const t of s.texts) expect(within(t.box, 0), t.text).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('with no icon art, passives and relics keep their letter tiles and badges', async ({
  page,
}) => {
  // The build icons' page failing takes every atlas page down with it (CO-130).
  await page.route('**/assets/atlas/props17.png', (route) => route.abort());
  await openResult(page, maxedPayload('win'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4);
  const s = await sample(page);
  await page.screenshot({ path: test.info().outputPath('result-no-icons.png') });

  expect(s.iconFrames).toEqual([]);
  expect(s.passiveIcons).toEqual([]);
  expect(s.relicIcons).toEqual([]);
  expectBuildAboveButton(s, s.passiveTiles, s.relicGems);
  const texts = s.texts.map((t) => t.text);
  for (const { id, name } of [...PASSIVES, ...RELIC_BUFFS]) {
    expect(texts, id).toContain(abbreviate(name));
  }
});

for (const [name, click, enter] of [
  ['a click starts', true, false],
  ['Enter starts', false, true],
  ['a click and Enter on the same frame start', true, true],
] as const) {
  test(`${name} exactly one SpellSelect`, async ({ page }) => {
    const errors = collectErrors(page);
    await openResult(page, maxedPayload('win'));
    await waitForScene(page, SCENE.result);
    await frames(page, 4);
    const { controls } = await sample(page);
    const button = controls?.button;
    expect(button).toBeDefined();
    if (!button) return;

    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    if (click) await page.mouse.down();
    // The release and Enter in one task, so both reach Result on the same frame.
    await page.evaluate(
      ({ x, y, click, enter }) => {
        const canvas = document.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect) throw new Error('no canvas');
        const at = { clientX: rect.left + x, clientY: rect.top + y, button: 0, bubbles: true };
        if (click) canvas.dispatchEvent(new MouseEvent('mouseup', at));
        if (enter) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
          );
        }
      },
      { x, y, click, enter },
    );
    await waitForScene(page, SCENE.spellSelect);
    await frames(page, 10);
    expect(await spellSelectStarts(page)).toBe(1);
    expect(await isSceneActive(page, SCENE.result)).toBe(false);
    expect(errors).toEqual([]);
  });
}

for (const [name, click, esc] of [
  ['a click on Main menu opens', true, false],
  ['Esc opens', false, true],
  ['a click on Main menu and Esc on the same frame open', true, true],
] as const) {
  test(`${name} exactly one main menu (CO-218)`, async ({ page }) => {
    const errors = collectErrors(page);
    await openResult(page, maxedPayload('lose'));
    await waitForScene(page, SCENE.result);
    await frames(page, 4);
    const { controls } = await sample(page);
    const button = controls?.menuButton;
    expect(button).toBeDefined();
    if (!button) return;

    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    await page.mouse.move(x, y);
    if (click) await page.mouse.down();
    await page.evaluate(
      ({ x, y, click, esc }) => {
        const canvas = document.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect) throw new Error('no canvas');
        const at = { clientX: rect.left + x, clientY: rect.top + y, button: 0, bubbles: true };
        if (click) canvas.dispatchEvent(new MouseEvent('mouseup', at));
        if (esc) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
          );
        }
      },
      { x, y, click, esc },
    );
    await waitForScene(page, SCENE.intro);
    await frames(page, 10);
    expect(await introStarts(page)).toBe(1);
    expect(await spellSelectStarts(page)).toBe(0);
    expect(await isSceneActive(page, SCENE.result)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('pad A lights Play again, then starts exactly one SpellSelect', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'e2e pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { e2ePad: typeof pad }).e2ePad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  const pressA = async (): Promise<void> => {
    for (const down of [true, false]) {
      await page.evaluate((pressed) => {
        const pad = (
          window as unknown as {
            e2ePad: { timestamp: number; buttons: { pressed: boolean; value: number }[] };
          }
        ).e2ePad;
        pad.buttons[0] = { pressed, value: pressed ? 1 : 0 };
        // Phaser skips a pad state stamped before it first saw the pad.
        pad.timestamp = performance.now();
      }, down);
      await frames(page, 4);
    }
  };
  const errors = collectErrors(page);
  await openResult(page, maxedPayload('lose'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4); // the first poll after a connect only takes a baseline

  expect((await focusRing(page, SCENE.result)).visible, 'no ring before the pad wakes').toBe(false);
  await pressA(); // reveals the highlight
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  // The shared focus ring (CO-196) is round the button, and the press did not confirm.
  const ring = await focusRing(page, SCENE.result);
  expect(ring.visible).toBe(true);
  expect(ring.box).toEqual(RESULT_LAYOUT.button);
  await expectRingReadable(page, SCENE.result, 'Play again');
  // The ring's outer edge stays clear of the hint under it, with room for CI's taller fonts.
  const controls = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as unknown as { controls: ResultControls }).controls;
  }, SCENE.result);
  expect(ring.outer!.y + ring.outer!.height).toBeLessThanOrEqual(controls.hint.y);
  await pressA();
  await waitForScene(page, SCENE.spellSelect);
  await frames(page, 10);
  expect(await spellSelectStarts(page)).toBe(1);
  expect(errors).toEqual([]);
});

/** One fault each, so every guard path is proven in the browser on its own. */
const HOSTILE_BUILDS: readonly [string, Record<string, unknown>][] = [
  [
    'a markup spell name',
    { spells: [{ id: 'fire', name: '<img src=x onerror=alert(1)>', color: 0, level: 1 }] },
  ],
  ['a spell level of 4', { spells: [{ id: 'fire', name: 'Fire Bolt', color: 0, level: 4 }] }],
  ['a __proto__ passive id', { passives: [['__proto__', 1]] }],
  ['a rank of 0', { passives: [['passive_power', 0]] }],
  ['an unknown relic id', { relics: [['relic_nope', 1]] }],
];

for (const [name, fault] of HOSTILE_BUILDS) {
  test(`a build with ${name} is turned away, and the screen falls back to SpellSelect`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    const payload = maxedPayload('win');
    await openResult(page, { ...payload, build: { ...payload.build, ...fault } });
    await waitForScene(page, SCENE.spellSelect);

    const summary = await page.evaluate(async (scene) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(scene.result) as ResultScene).summary;
    }, SCENE);
    expect(summary).toBeNull();
    expect(warnings.some((w) => w.includes('[Result] started without a valid payload'))).toBe(true);
    // The warning names no part of the payload.
    expect(warnings.join('\n')).not.toMatch(/onerror|__proto__|relic_nope/);
    expect(errors).toEqual([]);
  });
}

/** Standard-mapping pad buttons. */
const A = 0;
const B = 1;
const RIGHT = 15;
const UP = 12;
const DOWN = 13;

/** A fake standard-mapping pad Phaser finds by polling `navigator.getGamepads`; call before `goto`. */
async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'e2e pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { e2ePad: typeof pad }).e2ePad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
}

/** Press and release one button on the fake pad, a few frames each. */
async function pressPad(page: Page, button: number): Promise<void> {
  for (const down of [true, false]) {
    await page.evaluate(
      ([index, pressed]) => {
        const pad = (
          window as unknown as {
            e2ePad: { timestamp: number; buttons: { pressed: boolean; value: number }[] };
          }
        ).e2ePad;
        pad.buttons[index as number] = { pressed: pressed as boolean, value: pressed ? 1 : 0 };
        // Phaser skips a pad state stamped before it first saw the pad.
        pad.timestamp = performance.now();
      },
      [button, down] as const,
    );
    await frames(page, 4);
  }
}

/** The pad's or arrows' focus and the info line (CO-198), read in one evaluate. */
function readNav(page: Page): Promise<{
  focus: PauseFocus | null;
  info: string;
  cursor: { x: number; y: number } | null;
}> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as ResultScene).nav;
  }, SCENE.result);
}

/** Every spell, passive and relic of the roster at its top rank: the biggest build a crafted payload can hold. */
function bigPayload(outcome: Outcome): ResultPayload {
  const maxed = maxedPayload(outcome);
  return {
    ...maxed,
    build: {
      ...maxed.build,
      spells: ROSTER_SPELL_IDS.map((id) => ({
        id,
        name: ROSTER_SPELL_CARDS[id].name,
        color: ROSTER_SPELL_CARDS[id].color,
        level: 3,
      })),
    },
  };
}

/** The strips' interactive faces, in draw order: spells, then passives, then relics. */
interface Face {
  x: number;
  y: number;
  lineWidth: number;
  alpha: number;
}

function readFaces(page: Page): Promise<Face[]> {
  return page.evaluate(
    async ({ scene, buttonY }) => {
      const { game } = await import('/src/main.ts');
      const result = game.scene.getScene(scene.result) as ResultScene;
      return (result.children.list as Phaser.GameObjects.Shape[])
        .filter((o) => o.input?.enabled && o.y < buttonY)
        .map((o) => ({ x: o.x, y: o.y, lineWidth: o.lineWidth, alpha: o.alpha }));
    },
    { scene: SCENE, buttonY: RESULT_LAYOUT.button.y },
  );
}

/** The info line's Text where it is drawn, and how it wrapped. */
interface InfoBox {
  text: string;
  color: string;
  alpha: number;
  lines: number;
  box: Box;
}

function readInfo(page: Page): Promise<InfoBox> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const result = game.scene.getScene(scene.result) as ResultScene;
    const text = result.nav.info;
    const t = (result.children.list as Phaser.GameObjects.Text[]).find(
      (o) => o.type === 'Text' && o.text === text,
    );
    if (!t) throw new Error(`no Text reads "${text}"`);
    const b = t.getBounds();
    return {
      text,
      color: t.style.color as string,
      alpha: t.alpha,
      lines: t.getWrappedText().length,
      box: { x: b.x, y: b.y, width: b.width, height: b.height },
    };
  }, SCENE);
}

const infosOf = (payload: ResultPayload): string[] => {
  const view = resultView(payload);
  return [...view.spells, ...view.passives, ...view.relics].map((tile) => itemInfo(tile));
};

test('pointing at a passive lights its rim and reads it out, and moving away restores the hint', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const payload = maxedPayload('win');
  await openResult(page, payload);
  await waitForScene(page, SCENE.result);
  await frames(page, 4);
  expect((await readNav(page)).info).toBe(INFO_HINT);

  const faces = await readFaces(page);
  const infos = infosOf(payload);
  expect(faces).toHaveLength(infos.length);
  const spells = payload.build.spells.length;
  const at = spells; // the first passive
  const face = faces[at]!;
  expect(face.lineWidth).toBe(1);
  await page.mouse.move(face.x, face.y);
  await frames(page, 3);
  expect((await readNav(page)).info).toBe(infos[at]);
  expect((await readFaces(page))[at]?.lineWidth).toBe(2);
  // The pointer alone never draws the ring.
  expect((await focusRing(page, SCENE.result)).visible).toBe(false);
  const info = await readInfo(page);
  expect(info.color).toBe('#eeeeee');

  // A spell's rim is already 2 wide at rest and goes to 3.
  const spell = faces[0]!;
  await page.mouse.move(spell.x, spell.y);
  await frames(page, 3);
  expect((await readNav(page)).info).toBe(infos[0]);
  expect((await readFaces(page))[0]?.lineWidth).toBe(3);

  await page.mouse.move(5, 5);
  await frames(page, 3);
  expect((await readNav(page)).info).toBe(INFO_HINT);
  expect((await readInfo(page)).color).toBe('#888888');
  expect((await readFaces(page))[0]?.lineWidth).toBe(2);
  expect(errors).toEqual([]);
});

test('the arrows walk both buttons and the strips, and Enter acts only on a button', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const payload = maxedPayload('lose');
  await openResult(page, payload);
  await waitForScene(page, SCENE.result);
  await frames(page, 4);
  const infos = infosOf(payload);
  expect((await readNav(page)).focus).toBeNull();

  // The first arrow only wakes the highlight, on Play again.
  await page.keyboard.press('ArrowRight');
  await frames(page, 2);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 0 });
  expect((await focusRing(page, SCENE.result)).box).toEqual(RESULT_LAYOUT.button);

  // Right and left step between the buttons (CO-218).
  await page.keyboard.press('ArrowRight');
  await frames(page, 2);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 1 });
  expect((await focusRing(page, SCENE.result)).box).toEqual(RESULT_LAYOUT.menuButton);
  await expectRingReadable(page, SCENE.result, 'Main menu');
  await page.keyboard.press('ArrowLeft');
  await frames(page, 2);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 0 });

  // Up goes to the last row, at the item nearest Play again, and Enter there does nothing.
  await page.keyboard.press('ArrowUp');
  await frames(page, 2);
  let nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', col: 0, menu: 0 });
  const landed = nav.focus;
  await page.keyboard.press('Enter');
  await frames(page, 10);
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  expect(await spellSelectStarts(page)).toBe(0);
  expect((await readNav(page)).focus).toEqual(landed);

  // Up to the first strip item.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('ArrowUp');
    await frames(page, 2);
  }
  nav = await readNav(page);
  expect(nav.focus).toEqual({ zone: 'build', row: 0, col: 0, menu: 0 });
  expect(nav.info).toBe(infos[0]);
  expect(nav.cursor).not.toBeNull();
  const ring = await focusRing(page, SCENE.result);
  expect(ring.visible).toBe(true);
  const box = ring.box!;
  expect(box.x + box.width / 2).toBeCloseTo(nav.cursor!.x, 0);
  expect(box.y + box.height / 2).toBeCloseTo(nav.cursor!.y, 0);
  await expectRingReadable(page, SCENE.result, 'spell');

  // Down through the strips to the last row, then off it onto the button nearest across.
  let last: PauseFocus | null = null;
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
    const focus = (await readNav(page)).focus;
    if (focus?.zone === 'menu') break;
    last = focus;
  }
  nav = await readNav(page);
  expect(last).toMatchObject({ zone: 'build' });
  expect(nav.focus).toEqual({ zone: 'menu', index: 0 });
  expect(nav.cursor).toBeNull();
  expect(nav.info).toBe(INFO_HINT);

  // Over to Main menu, and Enter opens exactly one main menu.
  await page.keyboard.press('ArrowRight');
  await frames(page, 2);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 1 });
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  expect(await introStarts(page)).toBe(1);
  expect(await spellSelectStarts(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('Enter with nothing selected starts exactly one SpellSelect', async ({ page }) => {
  const errors = collectErrors(page);
  await openResult(page, maxedPayload('win'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4);
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  await frames(page, 10);
  expect(await spellSelectStarts(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('the pad reaches the strips, A does nothing there, and A on Play again starts one run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await installPad(page);
  await openResult(page, maxedPayload('win'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4); // the first poll after a connect only takes a baseline

  await pressPad(page, A); // wakes Play again
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 0 });
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  await pressPad(page, UP);
  const nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build' });
  expect(nav.cursor).not.toBeNull();
  expect(nav.info).not.toBe(INFO_HINT);
  const focus = nav.focus;
  await pressPad(page, A);
  await frames(page, 10);
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  expect(await spellSelectStarts(page)).toBe(0);
  expect((await readNav(page)).focus).toEqual(focus);

  // Down off the last row is Play again.
  for (let i = 0; i < 6 && (await readNav(page)).focus?.zone === 'build'; i += 1) {
    await pressPad(page, DOWN);
  }
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 0 });
  await pressPad(page, A);
  await waitForScene(page, SCENE.spellSelect);
  await frames(page, 10);
  expect(await spellSelectStarts(page)).toBe(1);
  expect(errors).toEqual([]);
});

for (const outcome of ['win', 'lose', 'ended'] as const) {
  test(`${outcome}: the info line fits its place for every item of the biggest build`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const payload = bigPayload(outcome);
    await openResult(page, payload);
    await waitForScene(page, SCENE.result);
    await frames(page, 4);

    const { relics, info: slot, button } = RESULT_LAYOUT;
    const infos = infosOf(payload);
    const faces = await readFaces(page);
    expect(faces).toHaveLength(infos.length);
    expect(infos.length).toBe(ROSTER_SPELL_IDS.length + PASSIVES.length + RELIC_BUFFS.length);

    let maxLines = 0;
    let maxBottom = 0;
    let minTop = HEIGHT;
    let widest = 0;
    let longest = '';
    for (const [i, face] of faces.entries()) {
      await page.mouse.move(face.x, face.y);
      await frames(page, 2);
      const read = await readInfo(page);
      expect(read.text, `item ${i}`).toBe(infos[i]);
      expect(read.lines, read.text).toBeLessThanOrEqual(2);
      expect(read.box.y, read.text).toBeGreaterThanOrEqual(relics.y + relics.height + 4);
      expect(read.box.y + read.box.height, read.text).toBeLessThanOrEqual(button.y - 8);
      expect(within(read.box, 0), read.text).toBe(true);
      expect(read.box.x, read.text).toBeGreaterThanOrEqual(SLACK);
      expect(read.box.x + read.box.width, read.text).toBeLessThanOrEqual(WIDTH - SLACK);
      expect(read.box.x).toBeGreaterThanOrEqual(slot.x - 1);
      expect(read.alpha).toBe(1);
      maxLines = Math.max(maxLines, read.lines);
      maxBottom = Math.max(maxBottom, read.box.y + read.box.height);
      minTop = Math.min(minTop, read.box.y);
      widest = Math.max(widest, read.box.width);
      if (read.text.length > longest.length) longest = read.text;
    }
    // Every placement this screen promises the browser suite is unchanged.
    const s = await sample(page);
    expect(s.controls?.button).toEqual(RESULT_LAYOUT.button);
    expect(s.texts.map((t) => t.text)).toContain(HINT);
    console.log(
      `[info fits ${outcome}] items=${faces.length} longest=${longest.length} chars, ` +
        `max lines=${maxLines}, top=${minTop.toFixed(1)} (strips end ${relics.y + relics.height}), ` +
        `bottom=${maxBottom.toFixed(1)} (button top ${button.y}), widest=${widest.toFixed(1)}`,
    );
    expect(errors).toEqual([]);
  });
}

test('the spell names of a full three-spell build stay inside the spells strip', async ({
  page,
}) => {
  await openResult(page, maxedPayload('win'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4);
  const s = await sample(page);
  const strip = RESULT_LAYOUT.spells;
  for (const spell of s.summary?.build.spells ?? []) {
    const name = s.texts.find((t) => t.text === spell.name);
    expect(name, spell.name).toBeDefined();
    const b = name!.box;
    console.log(
      `[spell name] ${spell.name}: y ${b.y.toFixed(1)}..${(b.y + b.height).toFixed(1)} ` +
        `x ${b.x.toFixed(1)}..${(b.x + b.width).toFixed(1)} in strip y ${strip.y}..${strip.y + strip.height}, ` +
        `x ${strip.x}..${strip.x + strip.width}`,
    );
    expect(b.y).toBeGreaterThanOrEqual(strip.y);
    expect(b.y + b.height).toBeLessThanOrEqual(strip.y + strip.height);
    expect(b.x + b.width).toBeLessThanOrEqual(strip.x + strip.width);
  }
});

test('a defeat leaves the strips and the info line fully readable', async ({ page }) => {
  const errors = collectErrors(page);
  const payload = maxedPayload('lose');
  await openResult(page, payload);
  await waitForScene(page, SCENE.result);
  await frames(page, 4);

  // Everything right of the card and above the info line: alpha 1, never tinted.
  const dimmed = await page.evaluate(
    async ({ scene, layout }) => {
      const { game } = await import('/src/main.ts');
      const result = game.scene.getScene(scene.result) as ResultScene;
      const right = layout.spells.x;
      const bottom = layout.relics.y + layout.relics.height;
      return (result.children.list as Phaser.GameObjects.Image[])
        .filter((o) => o.x >= right && o.y >= layout.spells.y && o.y <= bottom)
        .filter((o) => o.alpha !== 1 || (o.type === 'Image' && o.isTinted))
        .map((o) => `${o.type}@${o.x},${o.y} alpha=${o.alpha}`);
    },
    { scene: SCENE, layout: RESULT_LAYOUT },
  );
  expect(dimmed).toEqual([]);

  const face = (await readFaces(page))[0]!;
  await page.mouse.move(face.x, face.y);
  await frames(page, 3);
  const info = await readInfo(page);
  expect(info.text).toBe(infosOf(payload)[0]);
  expect(info.alpha).toBe(1);
  expect(info.color).toBe('#eeeeee');
  expect(errors).toEqual([]);
});

test('an empty build has nothing to reach: up and down stay on the buttons and Enter starts one run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const payload = maxedPayload('ended');
  await openResult(page, { ...payload, build: { spells: [], passives: [], relics: [] } });
  await waitForScene(page, SCENE.result);
  await frames(page, 4);

  await page.keyboard.press('ArrowRight');
  await frames(page, 2);
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    await frames(page, 2);
    const nav = await readNav(page);
    expect(nav.focus, key).toEqual({ zone: 'menu', index: 0 });
    expect(nav.info).toBe(INFO_HINT);
    expect(nav.cursor).toBeNull();
  }
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  await frames(page, 10);
  expect(await spellSelectStarts(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('pad B opens exactly one main menu, without waking the highlight first (CO-218)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await installPad(page);
  await openResult(page, maxedPayload('win'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4); // the first poll after a connect only takes a baseline

  await pressPad(page, B);
  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  expect(await introStarts(page)).toBe(1);
  expect(await spellSelectStarts(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the pad reaches Main menu with right, and A on it opens exactly one main menu', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await installPad(page);
  await openResult(page, maxedPayload('lose'));
  await waitForScene(page, SCENE.result);
  await frames(page, 4);

  await pressPad(page, A); // wakes Play again
  await pressPad(page, RIGHT);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 1 });
  const ring = await focusRing(page, SCENE.result);
  expect(ring.box).toEqual(RESULT_LAYOUT.menuButton);
  // Main menu's ring stays clear of Play again beside it and the hint under it.
  const controls = (await sample(page)).controls!;
  expect(ring.outer!.x).toBeGreaterThan(controls.button.x + controls.button.width);
  expect(ring.outer!.y + ring.outer!.height).toBeLessThanOrEqual(controls.hint.y);
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  await pressPad(page, A);
  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  expect(await introStarts(page)).toBe(1);
  expect(await spellSelectStarts(page)).toBe(0);
  expect(errors).toEqual([]);
});
