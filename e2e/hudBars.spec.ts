import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { HudScene } from '../src/scenes/HudScene';
import { cardCenter, collectErrors, readHud, startFromIntro, waitForScene } from './game';

/**
 * CO-156 in the browser: the HP and XP bars are drawn in their pixel-art
 * frames, and with the frames' atlas page missing every bar falls back to the
 * flat placeholder and the run still plays. CO-195: the shield is drawn on the
 * HP bar, so Ice Shield through `?loadout=` puts an ice segment and a `+N` on it.
 */
async function startRun(page: Page, shield = true): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1${shield ? '&loadout=ice_shield' : ''}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  if (shield) await expect.poll(async () => (await readHud(page)).shield).toBeGreaterThan(0);
}

/** The HP bar as drawn beside the model it was drawn from, and the HP and XP frames' boxes, in one read. */
function sampleHpBar(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    type Boxed = { frame?: { name: string }; getBounds?: () => { top: number; bottom: number } };
    const box = (name: string) => {
      const child = hud.children.list
        .map((c) => c as unknown as Boxed)
        .find((c) => c.frame?.name === name);
      const b = child?.getBounds?.();
      return b ? { top: b.top, bottom: b.bottom } : null;
    };
    return {
      drawn: hud.hpBarShown,
      hp: hud.view.hp,
      maxHp: hud.view.maxHp,
      shield: hud.view.shield,
      hpFrame: box('hud.hpFrame.0.art.l'),
      hpMark: box('hud.hpMark.0.art'),
      xpFrame: box('hud.xpFrame.0.art.l'),
      xpMark: box('hud.xpMark.0.art'),
    };
  }, SCENE.hud);
}

/** The bar look and the HUD bar art on show, read together so the run cannot step between them. */
function sample(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    // A TileSprite's `frame` is its own canvas; the atlas frame it tiles is
    // `displayFrame`, which Phaser 3.88's typings leave out.
    type Drawn = { visible: boolean; frame?: { name: string }; displayFrame?: { name: string } };
    const frames = hud.children.list
      .map((child) => child as unknown as Drawn)
      .filter((child) => child.visible)
      .map((child) => (child.displayFrame ?? child.frame)?.name ?? '')
      .filter((name) => name.startsWith('hud.'));
    return { look: hud.barLook, frames, hp: hud.view.hp, elapsedMs: hud.view.elapsedMs };
  }, SCENE.hud);
}

test('the HP and XP bars are drawn in their pixel-art frames', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);

  const { look, frames } = await sample(page);
  expect(look).toBe('art');
  // Three pieces and a mark per bar, and no shield bar of its own (CO-195).
  // The boss frame and its skull show once even so: the top-right plate wears
  // them (CO-193). A boss bar drawn as well would list them twice, so the
  // single set also shows that bar hidden.
  const pieces = (bar: string) => [
    `hud.${bar}Frame.0.art.l`,
    `hud.${bar}Frame.0.art.m`,
    `hud.${bar}Frame.0.art.r`,
    `hud.${bar}Mark.0.art`,
  ];
  expect(frames).toEqual(['hp', 'xp', 'boss'].flatMap(pieces));

  expect(errors).toEqual([]);
});

test('a shield is an ice segment and a +N on the HP bar, which sits right on the XP bar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);

  const s = await sampleHpBar(page);
  const drawn = s.drawn!;
  // Full HP plus a shield: the bar stands for both, the red shrunk to make room.
  expect(s.hp).toBe(s.maxHp);
  const span = s.hp + s.shield;
  expect(drawn.start).toBeCloseTo(s.hp / span, 5);
  expect(drawn.width).toBeCloseTo(s.shield / span, 5);
  expect(drawn.start + drawn.width).toBeLessThanOrEqual(1 + 1e-9);
  expect(drawn.afterText).toBe(`HP ${Math.ceil(s.hp)}`);
  expect(drawn.text).toBe(`+${Math.ceil(s.shield)}`);
  // The +N sits on the HP bar's centre line, level with the HP label.
  expect(drawn.y).toBeCloseTo((s.hpFrame!.top + s.hpFrame!.bottom) / 2, 0);

  // No empty slot: the XP frame starts just under the HP frame, and its mark clears the heart.
  const { hpFrame, hpMark, xpFrame, xpMark } = s;
  expect(xpFrame!.top - hpFrame!.bottom).toBeGreaterThanOrEqual(0);
  expect(xpFrame!.top - hpFrame!.bottom).toBeLessThanOrEqual(4);
  expect(xpMark!.top).toBeGreaterThanOrEqual(hpMark!.bottom);

  expect(errors).toEqual([]);
});

test('with no shield the HP bar is HP alone, laid out the same', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, false);

  const s = await sampleHpBar(page);
  expect(s.shield).toBe(0);
  expect(s.drawn).toMatchObject({
    width: 0,
    text: '',
    afterText: `HP ${Math.ceil(s.hp)} / ${s.maxHp}`,
  });
  expect(s.drawn!.start).toBeCloseTo(s.hp / s.maxHp, 5);
  expect(s.xpFrame!.top - s.hpFrame!.bottom).toBeLessThanOrEqual(4);

  expect(errors).toEqual([]);
});

test('with the bar frames missing, every bar is the flat bar and the run plays', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  // Phaser logs its own error for the aborted file, so errors are not asserted here.
  await startRun(page);

  const before = await sample(page);
  expect(before.look).toBe('flat');
  expect(before.frames).toEqual([]);
  // The flat HP bar carries the shield too (CO-195).
  const flat = await sampleHpBar(page);
  expect(flat.drawn!.width).toBeGreaterThan(0);
  expect(flat.drawn!.text).toBe(`+${Math.ceil(flat.shield)}`);
  expect(warnings.some((w) => w.includes('[atlas]') && w.includes('props11.png'))).toBe(true);

  await expect
    .poll(async () => (await sample(page)).elapsedMs, { message: 'the run clock advances' })
    .toBeGreaterThan(before.elapsedMs + 1000);
  expect((await sample(page)).hp).toBeGreaterThan(0);
});
