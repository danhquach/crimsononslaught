import { expect, test, type Page } from '@playwright/test';
import { SPELL_CARDS, SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import {
  PAD,
  addFakePad,
  cardCenter,
  clickRow,
  collectErrors,
  focusRing,
  frames,
  menuRows,
  padPress,
  startFromIntro,
  waitForScene,
} from './game';
import { expectRingReadable } from './ringProbe';

/**
 * CO-196 in the browser: the arrows and a pad draw one shared focus ring, the
 * pointer alone never does, and the ring costs one paused-or-running tween per
 * scene however often focus moves or the scene restarts. Where the ring sits on
 * each screen is `menuLook.spec` (menu rows), `offerColors.spec` (cards),
 * `pause.spec` (Pause) and `result.spec` (Play again); how it looks is
 * `core/focusStyle.test.ts`.
 */

/**
 * The halo's alpha sampled every 50 ms for 800 ms (over half of one 1200 ms
 * pulse), all inside one evaluate so the samples share a clock.
 */
function haloAlphaRange(page: Page, key: string): Promise<{ min: number; max: number }> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    const { focusRingOf } = await import('/src/scenes/focusRing.ts');
    const scene = game.scene.getScene(sceneKey);
    const alphas: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      alphas.push(focusRingOf(scene).haloAlpha);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { min: Math.min(...alphas), max: Math.max(...alphas) };
  }, key);
}

/** Every tween the scene owns, running or paused. */
function tweenCount(page: Page, key: string): Promise<number> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.getScene(sceneKey).tweens.getTweens().length;
  }, key);
}

const centre = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

test('the ring adds one tween to a screen, however far focus moves or the screen reopens', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  await page.mouse.move(2, 2);
  const baseline = await tweenCount(page, SCENE.intro);
  expect((await focusRing(page, SCENE.intro)).visible).toBe(false);

  for (let i = 0; i < 12; i += 1) await page.keyboard.press(i % 3 === 2 ? 'ArrowUp' : 'ArrowDown');
  expect((await focusRing(page, SCENE.intro)).pulsing).toBe(true);
  const pulse = await haloAlphaRange(page, SCENE.intro);
  expect(pulse.max - pulse.min, 'the halo pulses').toBeGreaterThan(0.2);
  expect(await tweenCount(page, SCENE.intro)).toBe(baseline + 1);

  // Each visit to Settings and back builds Intro afresh: its ring starts over, never stacking.
  for (let visit = 0; visit < 3; visit += 1) {
    await clickRow(page, SCENE.intro, 'Settings');
    await waitForScene(page, SCENE.settings);
    await clickRow(page, SCENE.settings, 'Back  (Esc)');
    await waitForScene(page, SCENE.intro);
    await page.mouse.move(2, 2);
    expect(await tweenCount(page, SCENE.intro), `visit ${visit}: before focus`).toBe(baseline);
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await focusRing(page, SCENE.intro)).visible).toBe(true);
    expect(await tweenCount(page, SCENE.intro), `visit ${visit}: after focus`).toBe(baseline + 1);
  }
  expect(errors).toEqual([]);
});

test('Pause keeps one ring tween through many moves and through Yes / No restarts', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await menuRows(page, SCENE.pause)).length).toBe(5);
  const baseline = await tweenCount(page, SCENE.pause);

  // Down, into the strips and back, up: the walk visits both and ends on a menu row.
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp'];
  for (let i = 0; i < 20; i += 1) await page.keyboard.press(keys[i % keys.length]!);
  expect(await tweenCount(page, SCENE.pause)).toBe(baseline + 1);

  // End run asks first, and No comes back to the menu: each is a restart with a fresh ring.
  for (let i = 0; i < 6; i += 1) {
    const at = (await menuRows(page, SCENE.pause)).findIndex((row) => row.selected);
    if (at === 3) break;
    await page.keyboard.press(at < 3 ? 'ArrowDown' : 'ArrowUp');
  }
  expect((await menuRows(page, SCENE.pause))[3]?.selected).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await menuRows(page, SCENE.pause)).length).toBe(2);
  expect(await tweenCount(page, SCENE.pause)).toBe(baseline);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // No
  await expect.poll(async () => (await menuRows(page, SCENE.pause)).length).toBe(5);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await focusRing(page, SCENE.pause)).visible).toBe(true);
  expect(await tweenCount(page, SCENE.pause)).toBe(baseline + 1);
  expect(errors).toEqual([]);
});

test('the pointer alone never draws the ring, and cannot take it from the pad', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);
  const rows = await menuRows(page, SCENE.intro);
  const third = centre(rows[2]!.bounds);

  await page.mouse.move(third.x, third.y);
  await expect.poll(async () => (await menuRows(page, SCENE.intro))[2]?.hovered).toBe(true);
  expect((await focusRing(page, SCENE.intro)).visible, 'hover alone').toBe(false);

  // The pad has row 0; the pointer over row 2 lights it without moving the ring.
  await page.keyboard.press('ArrowDown');
  let now = await menuRows(page, SCENE.intro);
  expect(now[0]!.selected).toBe(true);
  expect(now[2]).toMatchObject({ hovered: true, selected: false });
  expect((await focusRing(page, SCENE.intro)).box).toEqual(rows[0]!.bounds);

  // The arrows carry on from row 0, and the ring follows them onto the hovered row.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  now = await menuRows(page, SCENE.intro);
  expect(now[2]).toMatchObject({ hovered: true, selected: true });
  expect((await focusRing(page, SCENE.intro)).box).toEqual(rows[2]!.bounds);
  expect(errors).toEqual([]);
});

test('the pointer over a level-up card does not draw the ring', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&timeScale=10&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await waitForScene(page, SCENE.levelUp);
  await page.mouse.move(400, 300); // over a card, whether the offer has one, two or three
  await expect
    .poll(() =>
      page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        const boxes = game.scene.getScene(key).children.list.filter((o) => o.type === 'Container');
        return boxes.some((box) =>
          (box as unknown as { list: { isStroked?: boolean; lineWidth?: number }[] }).list.some(
            (o) => o.isStroked && o.lineWidth === 4,
          ),
        );
      }, SCENE.levelUp),
    )
    .toBe(true);
  expect((await focusRing(page, SCENE.levelUp)).visible).toBe(false);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await focusRing(page, SCENE.levelUp)).visible).toBe(true);
  expect(errors).toEqual([]);
});

/** Each stroked frame's colour and width, in card order. */
function cardFrames(page: Page, key: string): Promise<{ color: number; width: number }[]> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    const boxes = game.scene
      .getScene(sceneKey)
      .children.list.filter((child) => child.type === 'Container');
    return boxes.map((box) => {
      const frame = (box as unknown as { list: { strokeColor: number; lineWidth: number }[] })
        .list[0]!;
      return { color: frame.strokeColor, width: frame.lineWidth };
    });
  }, key);
}

test('a pad puts the ring on a Spell Select card, and every card keeps its element colour', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await addFakePad(page);
  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.mouse.move(2, 2);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  expect((await focusRing(page, SCENE.spellSelect)).visible).toBe(false);

  for (const focused of [0, 1]) {
    await padPress(page, PAD.DOWN);
    await expect.poll(async () => (await focusRing(page, SCENE.spellSelect)).visible).toBe(true);
    const ring = await focusRing(page, SCENE.spellSelect);
    const { x, y } = cardCenter(focused);
    expect(ring.box!.x + ring.box!.width / 2, `card ${focused}`).toBe(x);
    expect(ring.box!.y + ring.box!.height / 2).toBe(y);
    await expectRingReadable(page, SCENE.spellSelect, `spell card ${focused}`);
    expect((await cardFrames(page, SCENE.spellSelect)).map((f) => [f.color, f.width])).toEqual(
      SPELL_IDS.map((id, i) => [SPELL_CARDS[id].color, i === focused ? 4 : 2]),
    );
  }
  expect(errors).toEqual([]);
});

/** The level-up overlay's Reroll, Skip and Ban frames, left to right. */
function buttonFrames(
  page: Page,
): Promise<{ x: number; y: number; color: number; width: number; fill: number }[]> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const frames = game.scene
      .getScene(key)
      .children.list.filter(
        (o) => o.type === 'Rectangle' && (o as unknown as { width: number }).width === 150,
      ) as unknown as {
      x: number;
      y: number;
      strokeColor: number;
      lineWidth: number;
      fillColor: number;
    }[];
    return frames
      .sort((a, b) => a.x - b.x)
      .map((f) => ({
        x: f.x,
        y: f.y,
        color: f.strokeColor,
        width: f.lineWidth,
        fill: f.fillColor,
      }));
  }, SCENE.levelUp);
}

test('a level-up button keeps the ring and its focused look when the pointer passes over cards and buttons', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&timeScale=10&invulnerable=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  await page.keyboard.press('1');
  await waitForScene(page, SCENE.game);
  await waitForScene(page, SCENE.levelUp);
  const cards = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key) as unknown as {
      cards: unknown[];
      children: { list: { type: string; x: number; y: number }[] };
    };
    const boxes = scene.children.list.filter((o) => o.type === 'Container');
    return { n: scene.cards.length, first: { x: boxes[0]!.x, y: boxes[0]!.y } };
  }, SCENE.levelUp);
  await page.mouse.move(5, 5);

  // First arrow wakes card 0; one more per card reaches Reroll.
  for (let i = 0; i <= cards.n; i += 1) await page.keyboard.press('ArrowDown');
  const [reroll, skip, ban] = await buttonFrames(page);
  await expect
    .poll(async () => {
      const ring = await focusRing(page, SCENE.levelUp);
      return ring.visible && ring.box!.x + ring.box!.width / 2 === reroll!.x;
    })
    .toBe(true);
  const focused = await expectRingReadable(page, SCENE.levelUp, 'level-up button');
  expect(focused.box!.y + focused.box!.height / 2).toBe(reroll!.y);
  const before = await buttonFrames(page);
  expect(before[0]).toMatchObject({ width: 4, fill: 0x2a2a2a });
  expect(before[1]).toMatchObject({ width: 2, fill: 0x1a1a1a });

  // The pointer over a card, then off it, and over another button, then off it.
  await page.mouse.move(cards.first.x, cards.first.y);
  await expect.poll(async () => (await cardFrames(page, SCENE.levelUp))[0]?.width).toBe(4);
  await page.mouse.move(skip!.x, skip!.y);
  await expect.poll(async () => (await buttonFrames(page))[1]?.width).toBe(4);
  await page.mouse.move(5, 5);
  await expect.poll(async () => (await buttonFrames(page))[1]?.width).toBe(2);
  const now = await buttonFrames(page);
  expect(now[0]).toMatchObject({ width: 4, fill: 0x2a2a2a });
  expect((await focusRing(page, SCENE.levelUp)).box).toEqual(focused.box);

  // Ban mode: the Ban button wears its crimson rim, and the ring stays on Reroll.
  await page.keyboard.press('b');
  await expect.poll(async () => (await buttonFrames(page))[2]?.color).toBe(0xdc143c);
  expect((await buttonFrames(page))[2]).toMatchObject({ width: 4 });
  expect((await focusRing(page, SCENE.levelUp)).box).toEqual(focused.box);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await buttonFrames(page))[2]?.color).toBe(ban!.color);
  expect(errors).toEqual([]);
});
