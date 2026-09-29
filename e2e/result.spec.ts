import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { PASSIVES } from '../src/config/passives';
import { RELIC_BUFFS } from '../src/config/relics';
import { PASSIVE_COLOR, RELIC_COLOR } from '../src/core/offerColors';
import { abbreviate } from '../src/core/pauseModel';
import { RESULT_HEADLINES, RESULT_LAYOUT } from '../src/core/resultModel';
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
 * allows without pushing "Play again" off the 960×540 screen, on every
 * outcome, and still starts exactly one SpellSelect. It is started directly
 * with a crafted payload; the real way in (End run from pause) is
 * `pause.spec.ts`'s, and a full Victory is `fullRun.spec.ts`'s.
 */

const WIDTH = 960;
const HEIGHT = 540;
/** CI's fonts render taller than a Mac's; keep this much clear of every edge. */
const SLACK = 8;

/** Every passive at its top rank, every relic stacked to the cap, and all three spell slots. */
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
        { id: 'lightning', name: 'Lightning Bolt', color: 0xffee55 },
        { id: 'lightning_companion', name: 'Lightning Companion', color: 0x88ccff },
        { id: 'lightning_tornado', name: 'Tornado', color: 0x88ccff },
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
      const counter = window as unknown as { spellSelectStarts: number };
      counter.spellSelectStarts = 0;
      game.scene.getScene(scene.spellSelect).events.on('create', () => {
        counter.spellSelectStarts += 1;
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
  expect(s.badges).toBe(PASSIVES.length + RELIC_BUFFS.length);
  expect(s.maxBadges).toBe(PASSIVES.filter((p) => p.maxRank !== undefined).length);
  const buttonTop = s.controls?.button.y ?? 0;
  for (const face of [...passives, ...relics]) {
    expect(within(face, SLACK), JSON.stringify(face)).toBe(true);
    expect(face.y + face.height).toBeLessThan(buttonTop);
  }
}

const buildFrames = [...PASSIVES, ...RELIC_BUFFS].map(({ id }) => `icon.${id}.0.art`);

const spellSelectStarts = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { spellSelectStarts: number }).spellSelectStarts);

for (const outcome of ['win', 'lose', 'ended'] as const) {
  test(`${outcome}: a maxed build keeps Play again and its hint on screen`, async ({ page }) => {
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

    const { button, hint } = s.controls ?? {};
    expect(button && within(button, SLACK), JSON.stringify(button)).toBe(true);
    expect(hint && within(hint, SLACK), JSON.stringify(hint)).toBe(true);
    const label = s.texts.find((t) => t.text === 'Play again');
    expect(label && within(label.box, SLACK)).toBe(true);
    // The hint's text box is where it draws, however tall CI's font makes it.
    const hintText = s.texts.find((t) => t.text === 'click, press Enter, or gamepad A');
    expect(hintText && within(hintText.box, SLACK)).toBe(true);

    // Every passive and relic wears its icon art (CO-179), not its letters, all above the button.
    expectBuildAboveButton(s, s.passiveIcons, s.relicIcons);
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
    { spells: [{ id: 'fire', name: '<img src=x onerror=alert(1)>', color: 0 }] },
  ],
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
