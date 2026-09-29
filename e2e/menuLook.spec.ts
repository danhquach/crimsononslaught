import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { SPELL_IDS } from '../src/config/spells';
import { emptySave } from '../src/core/save';
import { SCENE } from '../src/core/scenePayloads';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { PAD, addFakePad, frames, menuRows, padPress, sceneTexts, waitForScene } from './game';

/**
 * The menu screens read (CO-191): on every one, the arrows highlight a row, the
 * label of every row can be read against its own fill, and the lit row is
 * clearly not the unlit one. Judged on the screenshot the player would see, so
 * dark art on a dark backdrop and faint highlights fail here, not in review.
 * The screenshots are attached to the report.
 */

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; data: Buffer } } };
};

/** WCAG's floor for normal-size text. */
const MIN_CONTRAST = 4.5;
/** Mean per-channel difference (of 255) between a row lit and at rest. */
const MIN_LIT_DIFFERENCE = 10;

interface Screen {
  name: string;
  scene: string;
  /** The payload the screen is opened with, if it takes one. */
  data?: { view: string };
  /** Presses to the first row; SpellSelect's cards come before its buttons. */
  presses?: number;
  /** The screen takes no arrow keys, only a pad (SpellSelect, Upgrades). */
  pad?: boolean;
}

const SCREENS: Screen[] = [
  { name: 'intro', scene: SCENE.intro },
  { name: 'settings', scene: SCENE.settings },
  { name: 'profile', scene: SCENE.profile },
  { name: 'help-pickups', scene: SCENE.help, data: { view: 'pickups' } },
  { name: 'help-about', scene: SCENE.help, data: { view: 'about' } },
  { name: 'spell-select', scene: SCENE.spellSelect, presses: SPELL_IDS.length + 1, pad: true },
  { name: 'upgrades', scene: SCENE.upgrades, pad: true },
];

type Bounds = { x: number; y: number; width: number; height: number };

function luminance(r: number, g: number, b: number): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function pixels(png: { width: number; data: Buffer }, b: Bounds): number[][] {
  const out: number[][] = [];
  for (let y = Math.ceil(b.y); y < Math.floor(b.y + b.height); y++) {
    for (let x = Math.ceil(b.x); x < Math.floor(b.x + b.width); x++) {
      const i = (y * png.width + x) * 4;
      out.push([png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0]);
    }
  }
  return out;
}

/**
 * The label against its row's fill. The text is the brightest pixel inside the
 * label's box only, so an ember, an ornament, the edge or the ▶ cannot stand in
 * for it; `ink` counts the pixels there that are clearly not the fill. The fill
 * is the median pixel of the rest of the row, since a heavy face fills most of
 * its own box.
 */
function labelContrast(
  png: { width: number; data: Buffer },
  row: Bounds,
  label: Bounds,
): { ratio: number; ink: number } {
  const lum = ([r, g, b]: number[]): number => luminance(r ?? 0, g ?? 0, b ?? 0);
  const inside = (x: number, y: number): boolean =>
    x >= label.x && x < label.x + label.width && y >= label.y && y < label.y + label.height;
  const rest: number[] = [];
  for (let y = Math.ceil(row.y); y < Math.floor(row.y + row.height); y++) {
    for (let x = Math.ceil(row.x); x < Math.floor(row.x + row.width); x++) {
      if (inside(x, y)) continue;
      rest.push(lum(pixels(png, { x, y, width: 1, height: 1 })[0] ?? []));
    }
  }
  const fill = rest.sort((a, c) => a - c)[Math.floor(rest.length / 2)] ?? 0;
  const ratio = (a: number, c: number): number => (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
  const lums = pixels(png, label).map(lum);
  return {
    ratio: ratio(Math.max(...lums), fill),
    ink: lums.filter((l) => ratio(l, fill) >= 2).length,
  };
}

function meanDifference(
  a: { width: number; data: Buffer },
  b: { width: number; data: Buffer },
  bounds: Bounds,
): number {
  const [pa, pb] = [pixels(a, bounds), pixels(b, bounds)];
  const total = pa.reduce(
    (sum, p, i) => sum + p.reduce((s, v, k) => s + Math.abs(v - (pb[i]?.[k] ?? 0)), 0),
    0,
  );
  return total / (pa.length * 3);
}

async function open(page: Page, screen: Screen): Promise<void> {
  await page.evaluate(
    async ({ scene, data }) => {
      const { game } = await import('/src/main.ts');
      game.scene.getScenes(true)[0]?.scene.start(scene, data);
    },
    { scene: screen.scene, data: screen.data },
  );
  await waitForScene(page, screen.scene);
  // Nothing under the pointer, so only the arrows can light a row.
  await page.mouse.move(2, 2);
}

for (const screen of SCREENS) {
  test(`${screen.name}: the arrows light a row, and every label reads`, async ({ page }, info) => {
    // Some Embers, so the shop has Buy rows that can be pressed.
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: SAVE_STORAGE_KEY,
      value: JSON.stringify({ ...emptySave(), currency: 1000 }),
    });
    if (screen.pad) await addFakePad(page);
    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    if (screen.scene !== SCENE.intro) await open(page, screen);
    // Let the frame with the newest rows and any fade settle before looking.
    await page.waitForTimeout(500);

    const before = await menuRows(page, screen.scene);
    expect(before.length, 'rows drawn').toBeGreaterThan(0);
    expect(before.filter((row) => row.selected)).toEqual([]);
    const rest = PNG.sync.read(await page.screenshot());
    await info.attach(`${screen.name}-rest`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    if (screen.pad) await frames(page, 4); // the first poll after a connect only takes a baseline
    for (let i = 0; i < (screen.presses ?? 1); i++) {
      if (screen.pad) await padPress(page, PAD.DOWN);
      else await page.keyboard.press('ArrowDown');
    }
    await expect
      .poll(async () => (await menuRows(page, screen.scene)).filter((row) => row.selected).length)
      .toBe(1);
    const rows = await menuRows(page, screen.scene);
    const lit = rows.findIndex((row) => row.selected);
    expect(lit, 'the first arrow lights the first row').toBe(0);
    const shot = await page.screenshot();
    await info.attach(`${screen.name}-lit`, { body: shot, contentType: 'image/png' });
    const png = PNG.sync.read(shot);

    for (const row of rows) {
      const { bounds: r, labelBounds: l } = row;
      expect(l.width > 0 && l.height > 0, `"${row.label}" has a label box`).toBe(true);
      expect(
        l.x >= r.x &&
          l.y >= r.y &&
          l.x + l.width <= r.x + r.width &&
          l.y + l.height <= r.y + r.height,
        `"${row.label}" sits inside its row`,
      ).toBe(true);
      // A bar this wide shows a ▶ at its left when lit: the label keeps clear of it.
      if (r.width >= 100) {
        expect(l.x - r.x, `"${row.label}" clears the ▶`).toBeGreaterThanOrEqual(32);
      }
    }
    // A disabled label is dim on purpose; every other one must be readable.
    for (const row of rows.filter((r) => r.enabled)) {
      const { ratio, ink } = labelContrast(png, row.bounds, row.labelBounds);
      expect(ink, `"${row.label}" is drawn`).toBeGreaterThanOrEqual(5);
      expect(ratio, `"${row.label}" against its row`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
    expect(
      meanDifference(png, rest, rows[lit]?.bounds ?? rows[0]!.bounds),
      'lit row against the same row at rest',
    ).toBeGreaterThanOrEqual(MIN_LIT_DIFFERENCE);
  });
}

test('with the menu art missing, Boot still reaches Intro on plain rows and says so once', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  // The browser logs each aborted file as an error of its own, so only a thrown one counts.
  const thrown: string[] = [];
  page.on('pageerror', (error) => thrown.push(error.message));
  await page.route('**/assets/menu/**', (route) => route.abort());
  await page.goto('/?seed=1');
  await waitForScene(page, SCENE.intro);

  expect((await menuRows(page, SCENE.intro)).map((row) => row.label)).toEqual([
    'Start Game',
    'Settings',
    'Profile',
    'Help',
  ]);
  const menuWarnings = warnings.filter((text) => text.startsWith('[menu]'));
  expect(menuWarnings).toHaveLength(1);
  for (const file of ['menu_bg.jpg', 'menu_plate.png', 'menu_ember.png', 'menu_title.png']) {
    expect(menuWarnings[0], file).toContain(file);
  }
  // The title falls back to lettering.
  expect(await sceneTexts(page, SCENE.intro)).toContain('Crimson Onslaught');
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.spellSelect);
  expect(thrown).toEqual([]);
});
