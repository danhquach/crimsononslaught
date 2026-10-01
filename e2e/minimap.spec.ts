import { expect, test, type Page } from '@playwright/test';
import { MAX_LIVE_ENEMIES } from '../src/config/enemies';
import { FIRE_ROSTER_SPELL_IDS } from '../src/config/fireRoster';
import {
  DEFAULT_MINIMAP_SETTINGS,
  MINIMAP_MAX_PICKUPS,
  MINIMAP_PICKUP_KINDS,
  MINIMAP_SETTING_KEYS,
} from '../src/config/minimap';
import { SPELL_IDS } from '../src/config/spells';
import { PASSIVES } from '../src/config/passives';
import { emptySave } from '../src/core/save';
import { SAVE_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Save } from '../src/core/save';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import type { SettingsScene } from '../src/scenes/SettingsScene';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import {
  MIN_FPS,
  cardCenter,
  clickRow,
  collectErrors,
  frames,
  menuRows,
  readHud,
  sceneTexts,
  startFromIntro,
  waitForScene,
} from './game';

/**
 * CO-207 in the browser: the minimap's markers match the world, each switch
 * hides and shows its layer and survives a reload, a hostile save falls back to
 * the defaults, the map never overlaps the rest of the HUD, and a full crowd on
 * the Enemies layer holds the fps floor.
 */

/** Put `json` in storage before the page's own scripts run; only seeds an empty store, so a reload keeps what the game wrote. */
async function seedStorage(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: SAVE_STORAGE_KEY, value: json },
  );
}

function saveWith(settings: Save['settings']): string {
  return JSON.stringify({ ...emptySave(), settings });
}

/** The eight relics lie off screen from the start and are marked by default (#383), so a test that counts markers leaves them out. */
const NO_RELICS = saveWith({ [MINIMAP_SETTING_KEYS.relic]: false });
const GEMS_ON = saveWith({ [MINIMAP_SETTING_KEYS.gem]: true });

type Dropped = {
  kind: 'ember' | 'gem' | 'health' | 'magnet' | 'bomb' | 'chest';
  dx: number;
  dy: number;
};

/** Put pickups at offsets from the hero, bypassing the drop plan. Returns how many landed. */
function dropAt(page: Page, items: readonly Dropped[]): Promise<number> {
  return page.evaluate(
    async ([gameKey, list]) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(gameKey) as unknown as {
        player: { x: number; y: number };
        gems: { spawn(x: number, y: number): unknown };
        pickups: {
          dropEmber(x: number, y: number, value: number): boolean;
          dropConsumable(kind: string, x: number, y: number): boolean;
        };
      };
      const { x, y } = scene.player;
      let landed = 0;
      for (const { kind, dx, dy } of list as readonly Dropped[]) {
        const ok =
          kind === 'gem'
            ? scene.gems.spawn(x + dx, y + dy) !== null
            : kind === 'ember'
              ? scene.pickups.dropEmber(x + dx, y + dy, 1)
              : scene.pickups.dropConsumable(kind, x + dx, y + dy);
        if (ok) landed += 1;
      }
      return landed;
    },
    [SCENE.game, items] as const,
  );
}

/** What the map marks, by kind, with the snapshot it came from, in one evaluate. */
function markedKinds(page: Page): Promise<string[]> {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    return (rep.map?.pickups ?? []).map((p) => p.kind);
  }, SCENE.hud);
}

async function startRun(page: Page, query = ''): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await readHud(page)).spells.length).toBeGreaterThan(0);
  await expect.poll(async () => (await report(page)).world !== null).toBe(true);
}

function report(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).minimapReport;
  }, SCENE.hud);
}

function storedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => {
    const json = localStorage.getItem(key);
    return json ? (JSON.parse(json) as Save).settings : {};
  }, SAVE_STORAGE_KEY);
}

/** The map's geometry, read with the snapshot it was drawn from, in one evaluate. */
function geometry(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { MINIMAP_BOX, MINIMAP_PADDING, MINIMAP_RANGE } = await import('/src/config/minimap.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const centre = MINIMAP_BOX.size / 2;
    const radius = centre - MINIMAP_PADDING;
    const scale = radius / MINIMAP_RANGE;
    const player = rep.world?.player ?? { x: 0, y: 0 };
    return { rep, centre, radius, scale, player };
  }, SCENE.hud);
}

const KIND_LABELS = {
  health: 'Health',
  magnet: 'Magnet',
  bomb: 'Bomb',
  chest: 'Chest',
  relic: 'Relic',
  ember: 'Ember',
  gem: 'XP gems',
} as const;

const KINDS_ROW = 'Pickup kinds  ▸';

/** The pickup kinds page is up once its first switch is drawn; the main page once the row that opens it is. */
async function waitForPage(page: Page, kinds: boolean): Promise<void> {
  await waitForScene(page, SCENE.settings);
  await expect
    .poll(async () =>
      (await menuRows(page, SCENE.settings)).some((r) =>
        kinds ? r.label.startsWith('Health:') : r.label === KINDS_ROW,
      ),
    )
    .toBe(true);
}

async function openKinds(page: Page): Promise<void> {
  await clickRow(page, SCENE.settings, KINDS_ROW);
  await waitForPage(page, true);
}

/** Press the down arrow until the row labelled `label` is the highlighted one. */
async function arrowTo(page: Page, label: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    const rows = await menuRows(page, SCENE.settings);
    if (rows.find((r) => r.selected)?.label === label) return;
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
  }
  throw new Error(`the arrows never reached "${label}"`);
}

async function selectedLabel(page: Page): Promise<string | undefined> {
  return (await menuRows(page, SCENE.settings)).find((r) => r.selected)?.label;
}

test('the player sits at the centre and the viewport box where the world puts it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 15);

  const read = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { MINIMAP_BOX, MINIMAP_PADDING, MINIMAP_RANGE } = await import('/src/config/minimap.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const scale = (MINIMAP_BOX.size / 2 - MINIMAP_PADDING) / MINIMAP_RANGE;
    // The snapshot the map was drawn from: its camera view and its player.
    const view = rep.world?.view ?? { x: 0, y: 0, width: 0, height: 0 };
    const player = rep.world?.player ?? { x: 0, y: 0 };
    return {
      rep,
      centre: MINIMAP_BOX.size / 2,
      left: MINIMAP_BOX.size / 2 + (view.x - player.x) * scale,
      top: MINIMAP_BOX.size / 2 + (view.y - player.y) * scale,
      right: MINIMAP_BOX.size / 2 + (view.x + view.width - player.x) * scale,
    };
  }, SCENE.hud);

  expect(read.rep.visible).toBe(true);
  expect(read.rep.map?.player).toEqual({ x: read.centre, y: read.centre });
  const xs = (read.rep.map?.viewport ?? []).flatMap((s) => [s.x1, s.x2]);
  const ys = (read.rep.map?.viewport ?? []).flatMap((s) => [s.y1, s.y2]);
  expect(read.rep.map?.viewport).toHaveLength(4);
  expect(Math.min(...xs)).toBeCloseTo(read.left, 0);
  expect(Math.max(...xs)).toBeCloseTo(read.right, 0);
  expect(Math.min(...ys)).toBeCloseTo(read.top, 0);
  expect(read.rep.layers).toEqual({ viewport: true, boss: false, pickups: true, enemies: false });
  expect(read.rep.map?.enemies).toEqual([]);
  expect(errors).toEqual([]);
});

test('off-screen pickups in range sit at their spot, those beyond it are pinned to the rim', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedStorage(page, NO_RELICS);
  await startRun(page);

  const dropped = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as GameScene;
    return [
      scene.dropConsumable('health', 700),
      scene.dropConsumable('bomb', 300),
      scene.dropConsumable('chest', -1500),
    ];
  }, SCENE.game);
  expect(dropped).toEqual([true, true, true]);
  await expect.poll(async () => (await report(page)).map?.pickups.length).toBe(2);

  const read = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { MINIMAP_BOX, MINIMAP_PADDING, MINIMAP_RANGE } = await import('/src/config/minimap.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const centre = MINIMAP_BOX.size / 2;
    const radius = centre - MINIMAP_PADDING;
    const scale = radius / MINIMAP_RANGE;
    const player = rep.world?.player ?? { x: 0, y: 0 };
    const at = (kind: string) => rep.world?.pickups.find((p) => p.kind === kind) ?? player;
    const health = at('health');
    const chest = at('chest');
    const chestDist = Math.hypot(chest.x - player.x, chest.y - player.y);
    return {
      pickups: rep.map?.pickups ?? [],
      healthX: centre + (health.x - player.x) * scale,
      healthY: centre + (health.y - player.y) * scale,
      chestX: centre + ((chest.x - player.x) / chestDist) * radius,
      chestY: centre + ((chest.y - player.y) / chestDist) * radius,
    };
  }, SCENE.hud);
  expect(read.pickups.map((p) => p.kind).sort()).toEqual(['chest', 'health']);
  const health = read.pickups.find((p) => p.kind === 'health');
  expect(health?.pinned).toBe(false);
  expect(health?.x).toBeCloseTo(read.healthX, 0);
  expect(health?.y).toBeCloseTo(read.healthY, 0);
  const chest = read.pickups.find((p) => p.kind === 'chest');
  expect(chest?.pinned).toBe(true);
  expect(chest?.x).toBeCloseTo(read.chestX, 0);
  expect(chest?.y).toBeCloseTo(read.chestY, 0);
  expect(errors).toEqual([]);
});

test('the boss marker appears once the boss spawns, at its spot or pinned to the rim', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  expect((await report(page)).map?.boss).toBeNull();

  const spawned = await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(gameKey) as GameScene).spawnBossForTest();
  }, SCENE.game);
  expect(spawned).toBe(true);
  await expect.poll(async () => (await report(page)).layers.boss).toBe(true);

  const read = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { MINIMAP_BOX, MINIMAP_PADDING, MINIMAP_RANGE } = await import('/src/config/minimap.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const centre = MINIMAP_BOX.size / 2;
    const radius = centre - MINIMAP_PADDING;
    const scale = radius / MINIMAP_RANGE;
    const player = rep.world?.player ?? { x: 0, y: 0 };
    const boss = rep.world?.boss ?? { x: 0, y: 0 };
    const dx = (boss.x - player.x) * scale;
    const dy = (boss.y - player.y) * scale;
    const dist = Math.hypot(dx, dy);
    const pinned = dist > radius;
    const k = pinned ? radius / dist : 1;
    return { marker: rep.map?.boss, x: centre + dx * k, y: centre + dy * k, pinned };
  }, SCENE.hud);
  expect(read.marker).toBeTruthy();
  expect(read.marker?.pinned).toBe(read.pinned);
  expect(read.marker?.x).toBeCloseTo(read.x, 0);
  expect(read.marker?.y).toBeCloseTo(read.y, 0);
  expect(errors).toEqual([]);
});

test('the arena edge is absent at the arena centre and appears near an edge', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 15);
  expect((await report(page)).map?.arena).toEqual([]);

  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as unknown as {
      player: { setPosition(x: number, y: number): void };
    };
    scene.player.setPosition(300, 300);
  }, SCENE.game);
  await expect.poll(async () => (await report(page)).map?.arena.length).toBe(2);

  const read = await geometry(page);
  // The left and top edges (x = 0, y = 0) lie within range of the snapshot's player.
  const edges = read.rep.map?.arena ?? [];
  const vertical = edges.find((s) => Math.abs(s.x1 - s.x2) < 0.01);
  const horizontal = edges.find((s) => Math.abs(s.y1 - s.y2) < 0.01);
  expect(vertical?.x1).toBeCloseTo(read.centre - read.player.x * read.scale, 0);
  expect(horizontal?.y1).toBeCloseTo(read.centre - read.player.y * read.scale, 0);
  for (const s of edges) {
    for (const [x, y] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ] as const) {
      expect(Math.hypot(x - read.centre, y - read.centre)).toBeLessThanOrEqual(read.radius + 0.5);
    }
  }
  expect(errors).toEqual([]);
});

test('the map hides under the level-up and pause overlays and returns after', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  expect((await report(page)).visible).toBe(true);

  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as GameScene;
    scene.dropGemsForTest(Math.ceil(scene.xpReport.xpToNext));
  }, SCENE.game);
  await waitForScene(page, SCENE.levelUp);
  await expect.poll(async () => (await report(page)).visible).toBe(false);
  await page.keyboard.press('1');
  await expect.poll(async () => (await report(page)).visible).toBe(true);

  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  await expect.poll(async () => (await report(page)).visible).toBe(false);
  expect(errors).toEqual([]);
});

test('each switch hides its layer and all of them survive a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForScene(page, SCENE.settings);

  const labels = async (): Promise<string[]> =>
    (await menuRows(page, SCENE.settings)).map((row) => row.label);
  expect(await labels()).toEqual(
    expect.arrayContaining([
      'Minimap: On',
      'Viewport box: On',
      'Boss: On',
      'Pickups: On',
      'Enemies: Off',
    ]),
  );
  await clickRow(page, SCENE.settings, 'Viewport box: On');
  await clickRow(page, SCENE.settings, 'Boss: On');
  await clickRow(page, SCENE.settings, 'Pickups: On');
  await clickRow(page, SCENE.settings, 'Enemies: Off');
  await expect
    .poll(() => storedSettings(page))
    .toEqual(
      expect.objectContaining({
        [MINIMAP_SETTING_KEYS.on]: true,
        [MINIMAP_SETTING_KEYS.viewport]: false,
        [MINIMAP_SETTING_KEYS.boss]: false,
        [MINIMAP_SETTING_KEYS.pickups]: false,
        [MINIMAP_SETTING_KEYS.enemies]: true,
      }),
    );

  await page.reload();
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForScene(page, SCENE.settings);
  expect(await labels()).toEqual(
    expect.arrayContaining([
      'Minimap: On',
      'Viewport box: Off',
      'Boss: Off',
      'Pickups: Off',
      'Enemies: On',
    ]),
  );
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForScene(page, SCENE.intro);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await report(page)).world !== null).toBe(true);

  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as GameScene;
    scene.spawnBossForTest();
    scene.spawnCrowdForTest(20);
    scene.dropConsumable('health', 900);
  }, SCENE.game);
  await expect.poll(async () => (await report(page)).map?.enemies.length).toBeGreaterThan(0);
  const rep = await report(page);
  expect(rep.layers).toEqual({ viewport: false, boss: false, pickups: false, enemies: true });
  expect(rep.map?.viewport).toBeNull();
  expect(rep.map?.boss).toBeNull();
  expect(rep.map?.pickups).toEqual([]);
  expect(errors).toEqual([]);
});

test('the Minimap switch hides the whole map, and a change from the pause menu shows on resume', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedStorage(page, saveWith({ [MINIMAP_SETTING_KEYS.on]: false }));
  await startRun(page);
  expect((await report(page)).visible).toBe(false);

  // Turn the map on and the viewport box off from the pause menu; the run resumes with both.
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  const settingsAt = await page.evaluate(async (pauseKey) => {
    const { game } = await import('/src/main.ts');
    const button = game.scene
      .getScene(pauseKey)
      .children.list.find(
        (child) =>
          child.type === 'Text' && (child as unknown as { text: string }).text === 'Settings',
      ) as unknown as { getCenter(): { x: number; y: number } };
    return button.getCenter();
  }, SCENE.pause);
  await page.mouse.click(settingsAt.x, settingsAt.y);
  await waitForScene(page, SCENE.settings);
  await clickRow(page, SCENE.settings, 'Minimap: Off');
  await clickRow(page, SCENE.settings, 'Viewport box: On');
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForScene(page, SCENE.pause);
  const resumeAt = await page.evaluate(async (pauseKey) => {
    const { game } = await import('/src/main.ts');
    const button = game.scene
      .getScene(pauseKey)
      .children.list.find(
        (child) =>
          child.type === 'Text' && (child as unknown as { text: string }).text === 'Resume',
      ) as unknown as { getCenter(): { x: number; y: number } };
    return button.getCenter();
  }, SCENE.pause);
  await page.mouse.click(resumeAt.x, resumeAt.y);
  await expect.poll(async () => (await report(page)).visible).toBe(true);
  expect((await report(page)).layers.viewport).toBe(false);
  expect(errors).toEqual([]);
});

const HOSTILE = [
  {
    name: 'junk and unknown keys',
    json: saveWith({
      'minimap.on': 'no',
      'minimap.evil': true,
      'minimap.on\u200B': false,
      'minimap.\u202Eviewport': false,
      'minimap.\u043En': false,
      'minimap.boss': 7,
      'minimap.pickups.relic': 'false',
      'minimap.pickups.gem': 1,
      'minimap.pickups.health.x': false,
      'minimap.pickups.constructor': false,
      'minimap.pickups.\u0433em': true,
    }),
  },
  {
    name: 'a __proto__ object',
    json: JSON.stringify({
      ...emptySave(),
      settings: JSON.parse('{"__proto__":{"minimap.on":false}}'),
    }),
  },
  { name: 'broken JSON', json: '{"version":1,"settings":{"minimap.on":' },
];

for (const { name, json } of HOSTILE) {
  test(`a hostile save (${name}) runs on the defaults and loses its unknown keys`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await seedStorage(page, json);
    await startRun(page);
    const rep = await report(page);
    expect(rep.visible).toBe(true);
    expect(rep.layers).toEqual({ viewport: true, boss: false, pickups: true, enemies: false });
    expect(rep.world?.settings).toEqual(DEFAULT_MINIMAP_SETTINGS);
    const settings = await page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      const save = game.registry.get(key) as Save | undefined;
      return save?.settings ?? {};
    }, SAVE_REGISTRY_KEY);
    for (const key of Object.keys(settings).filter((k) => k.startsWith('minimap.'))) {
      expect(Object.values(MINIMAP_SETTING_KEYS) as string[]).toContain(key);
    }
    // Object.prototype stayed clean (the __proto__ payload must not have reached it).
    expect(
      await page.evaluate(() => Reflect.get(Object.prototype, 'minimap.on') as unknown),
    ).toBeUndefined();
    expect(errors.filter((text) => !text.includes('Failed to load resource'))).toEqual([]);
  });
}

const ICON_FRAMES = {
  health: 'pickupHealth.idle.0',
  magnet: 'pickupMagnet.idle.0',
  bomb: 'pickupBomb.idle.0',
  chest: 'pickupChest.idle.0',
  relic: 'pickupRelic.idle.0',
  ember: 'pickupEmber.idle.0',
  gem: 'gem.idle.0',
  boss: 'boss.walk.down.0',
} as const;

/** One pickup of each kind but relics (the arena's own are marked), two in range and two pinned, all inside the arena, plus the boss. */
async function placeMarkers(page: Page): Promise<void> {
  await page.evaluate(async (gameKey) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(gameKey) as unknown as {
      player: { x: number; y: number };
      pickups: { dropConsumable(kind: string, x: number, y: number): boolean };
      spawnBossForTest(): boolean;
    };
    const { x, y } = scene.player;
    scene.pickups.dropConsumable('health', x + 700, y);
    scene.pickups.dropConsumable('magnet', x - 800, y + 300);
    scene.pickups.dropConsumable('bomb', x + 900, y + 800);
    scene.pickups.dropConsumable('chest', x - 1000, y - 900);
    scene.spawnBossForTest();
  }, SCENE.game);
  expect(
    await dropAt(page, [
      { kind: 'ember', dx: 650, dy: -500 },
      { kind: 'gem', dx: -700, dy: 450 },
    ]),
  ).toBe(2);
  await expect
    .poll(async () => (await markedKinds(page)).filter((k) => k !== 'relic').length)
    .toBe(6);
  await expect.poll(async () => (await report(page)).layers.boss).toBe(true);
}

test('each pickup kind and the boss show their own atlas frame, and pinned icons stay inside the ring', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedStorage(page, GEMS_ON);
  await startRun(page);
  await placeMarkers(page);
  await frames(page, 3);

  const { rep, centre, radius } = await geometry(page);
  const pickups = rep.map?.pickups ?? [];
  const boss = rep.map?.boss;
  expect(boss).toBeTruthy();
  expect(rep.icons).toHaveLength(pickups.length + 1);
  const iconAt = (m: { x: number; y: number }) =>
    rep.icons.find((i) => Math.abs(i.x - m.x) < 0.01 && Math.abs(i.y - m.y) < 0.01);
  for (const kind of MINIMAP_PICKUP_KINDS) {
    const marker = pickups.find((p) => p.kind === kind);
    expect(marker, `${kind} marker`).toBeTruthy();
    expect(iconAt(marker ?? { x: NaN, y: NaN })?.frame, `${kind} icon`).toBe(ICON_FRAMES[kind]);
  }
  expect(iconAt(boss ?? { x: NaN, y: NaN })?.frame).toBe(ICON_FRAMES.boss);
  expect(pickups.filter((p) => p.pinned).length, 'pinned pickups').toBeGreaterThanOrEqual(2);
  for (const icon of rep.icons) {
    expect(Math.hypot(icon.x - centre, icon.y - centre)).toBeLessThanOrEqual(radius + 0.01);
  }
  expect(errors).toEqual([]);
});

test('without the atlas the markers fall back to flat shapes, with no errors', async ({ page }) => {
  await page.route('**/assets/atlas/props11.png', (route) => route.abort());
  const errors = collectErrors(page);
  const failed: string[] = [];
  page.on('requestfailed', (req) => failed.push(new URL(req.url()).pathname));
  await seedStorage(page, GEMS_ON);
  await startRun(page);
  await placeMarkers(page);
  await frames(page, 3);
  const rep = await report(page);
  expect(rep.icons).toEqual([]);
  expect((rep.map?.pickups ?? []).map((p) => p.kind)).toEqual(
    expect.arrayContaining([...MINIMAP_PICKUP_KINDS]),
  );
  expect(rep.map?.boss).toBeTruthy();
  // The aborted download (retried by the loader) is the browser's own console
  // error, so it must be the only request that failed.
  expect([...new Set(failed)]).toEqual(['/assets/atlas/props11.png']);
  expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);
});

const PAGE_ICON_LABELS = {
  main: {
    on: 'Minimap',
    viewport: 'Viewport box',
    boss: 'Boss',
    pickups: 'Pickups',
    enemies: 'Enemies',
  },
  pickups: KIND_LABELS,
} as const;

for (const atlas of [true, false]) {
  for (const settingsPage of ['main', 'pickups'] as const) {
    test(`each switch row on the ${settingsPage} Settings page has its icon left of its label, clear of it (${atlas ? 'atlas' : 'no atlas'})`, async ({
      page,
    }) => {
      if (!atlas) await page.route('**/assets/atlas/props11.png', (route) => route.abort());
      await page.goto('/?seed=1&invulnerable=1');
      await waitForScene(page, SCENE.intro);
      await clickRow(page, SCENE.intro, 'Settings');
      await waitForPage(page, false);
      if (settingsPage === 'pickups') await openKinds(page);
      const icons = await page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        return (game.scene.getScene(key) as unknown as SettingsScene).switchIconReports;
      }, SCENE.settings);
      const rows = await menuRows(page, SCENE.settings);
      const labels: Record<string, string> = PAGE_ICON_LABELS[settingsPage];
      expect(icons.map((i) => i.key)).toEqual(Object.keys(labels));
      for (const icon of icons) {
        const row = rows.find((r) => r.label.startsWith(`${labels[icon.key]}:`));
        expect(row, `${icon.key} row`).toBeTruthy();
        if (!row) continue;
        const { bounds: b, labelBounds: l } = row;
        expect(icon.bounds.x, `${icon.key} icon inside its row`).toBeGreaterThanOrEqual(b.x);
        expect(
          icon.bounds.x + icon.bounds.width + 8,
          `${icon.key} icon to label gap`,
        ).toBeLessThanOrEqual(l.x);
        const iconMid = icon.bounds.y + icon.bounds.height / 2;
        expect(Math.abs(iconMid - (l.y + l.height / 2)), `${icon.key} centres`).toBeLessThanOrEqual(
          2,
        );
        expect(icon.art, `${icon.key} art`).toBe(
          atlas && !['on', 'viewport', 'enemies'].includes(icon.key),
        );
      }
    });
  }
}

/** Every visible HUD object outside the map that overlaps its box. */
function overlaps(page: Page) {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const hud = game.scene.getScene(hudKey) as HudScene;
    const { bounds } = hud.minimapReport;
    const own = new Set(hud.minimapParts);
    type Box = { left: number; top: number; right: number; bottom: number };
    const hits: string[] = [];
    for (const child of hud.children.list) {
      if (own.has(child) || !(child as { visible?: boolean }).visible) continue;
      // A Graphics (a badge's pill) has no bounds; its Text is the same box.
      if (child.type === 'Graphics') continue;
      const box = (child as unknown as { getBounds(): Box }).getBounds();
      if (
        box.left < bounds.right &&
        bounds.left < box.right &&
        box.top < bounds.bottom &&
        bounds.top < box.bottom
      ) {
        hits.push(`${child.type} ${box.left},${box.top},${box.right},${box.bottom}`);
      }
    }
    return { hits, bounds };
  }, SCENE.hud);
}

for (const atlas of [true, false]) {
  test(`the map overlaps no other HUD element on the largest build (${atlas ? 'atlas' : 'no atlas'})`, async ({
    page,
  }) => {
    if (!atlas) await page.route('**/assets/atlas/props11.png', (route) => route.abort());
    await startRun(page, `&loadout=${FIRE_ROSTER_SPELL_IDS.join(',')}`);
    await page.evaluate(
      async ([gameKey, ids]) => {
        const { game } = await import('/src/main.ts');
        const { spells } = game.scene.getScene(gameKey) as unknown as {
          spells: { takePassive(id: string): void };
        };
        for (const id of ids) for (let i = 0; i < 3; i++) spells.takePassive(id);
        (game.scene.getScene(gameKey) as GameScene).spawnBossForTest();
      },
      [SCENE.game, PASSIVES.map((p) => p.id)] as const,
    );
    await expect.poll(async () => (await report(page)).layers.boss).toBe(true);
    await frames(page, 5);
    const { hits, bounds } = await overlaps(page);
    expect(hits, 'HUD objects overlapping the map').toEqual([]);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(960);
    expect(bounds.bottom).toBeLessThanOrEqual(540);
  });
}

test('relics, Embers and gems sit at their world spot on the map (#383)', async ({ page }) => {
  const errors = collectErrors(page);
  await seedStorage(page, GEMS_ON);
  await startRun(page);
  expect(
    await dropAt(page, [
      { kind: 'ember', dx: 600, dy: 100 },
      { kind: 'ember', dx: -1500, dy: 0 },
      { kind: 'gem', dx: -100, dy: 450 },
      { kind: 'gem', dx: 0, dy: -400 },
    ]),
  ).toBe(4);
  await expect
    .poll(async () => {
      const kinds = await markedKinds(page);
      return ['relic', 'ember', 'gem'].every((k) => kinds.includes(k));
    })
    .toBe(true);

  // World and map from one snapshot: every marker of the three kinds is where its pickup is.
  const read = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { MINIMAP_BOX, MINIMAP_PADDING, MINIMAP_RANGE } = await import('/src/config/minimap.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const centre = MINIMAP_BOX.size / 2;
    const radius = centre - MINIMAP_PADDING;
    const scale = radius / MINIMAP_RANGE;
    const player = rep.world?.player ?? { x: 0, y: 0 };
    const project = (p: { x: number; y: number }) => {
      const rx = (p.x - player.x) * scale;
      const ry = (p.y - player.y) * scale;
      const dist = Math.hypot(rx, ry);
      const k = dist <= radius ? 1 : radius / dist;
      return { x: centre + rx * k, y: centre + ry * k, pinned: dist > radius };
    };
    const kinds = ['relic', 'ember', 'gem'];
    const markers = (rep.map?.pickups ?? []).filter((m) => kinds.includes(m.kind));
    const world = (rep.world?.pickups ?? []).filter((p) => kinds.includes(p.kind));
    return {
      markers: markers.map((m) => ({
        kind: m.kind,
        pinned: m.pinned,
        match: world.some((p) => {
          const at = project(p);
          return p.kind === m.kind && Math.abs(at.x - m.x) < 0.01 && Math.abs(at.y - m.y) < 0.01;
        }),
      })),
      worldCount: Object.fromEntries(
        kinds.map((k) => [k, world.filter((p) => p.kind === k).length]),
      ),
    };
  }, SCENE.hud);
  console.log('markers', JSON.stringify(read));
  for (const kind of ['relic', 'ember', 'gem']) {
    const mine = read.markers.filter((m) => m.kind === kind);
    expect(mine.length, `${kind} markers`).toBeGreaterThan(0);
    expect(
      mine.every((m) => m.match),
      `${kind} markers at their spot`,
    ).toBe(true);
  }
  expect(
    read.markers.some((m) => m.kind === 'ember' && m.pinned),
    'a pinned Ember',
  ).toBe(true);
  expect(
    read.markers.some((m) => m.kind === 'ember' && !m.pinned),
    'an in-range Ember',
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('each pickup kind switch hides only its own kind and survives a reload (#383)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  await openKinds(page);
  const labels = async (): Promise<string[]> =>
    (await menuRows(page, SCENE.settings)).map((row) => row.label);
  expect((await labels()).slice(0, 7)).toEqual([
    'Health: On',
    'Magnet: On',
    'Bomb: On',
    'Chest: On',
    'Relic: On',
    'Ember: On',
    'XP gems: Off',
  ]);
  await clickRow(page, SCENE.settings, 'Relic: On');
  await clickRow(page, SCENE.settings, 'Health: On');
  await clickRow(page, SCENE.settings, 'XP gems: Off');
  await expect
    .poll(() => storedSettings(page))
    .toEqual(
      expect.objectContaining({
        [MINIMAP_SETTING_KEYS.relic]: false,
        [MINIMAP_SETTING_KEYS.health]: false,
        [MINIMAP_SETTING_KEYS.gem]: true,
        [MINIMAP_SETTING_KEYS.ember]: true,
      }),
    );

  await page.reload();
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  await openKinds(page);
  expect(await labels()).toEqual(
    expect.arrayContaining(['Relic: Off', 'Health: Off', 'XP gems: On', 'Ember: On']),
  );
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForPage(page, false);
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForScene(page, SCENE.intro);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await report(page)).world !== null).toBe(true);
  expect(
    await dropAt(page, [
      { kind: 'health', dx: 600, dy: 0 },
      { kind: 'magnet', dx: -600, dy: 0 },
      { kind: 'bomb', dx: 0, dy: 400 },
      { kind: 'chest', dx: 0, dy: -400 },
      { kind: 'ember', dx: 650, dy: 300 },
      { kind: 'gem', dx: -650, dy: -300 },
    ]),
  ).toBe(6);
  await expect.poll(async () => (await markedKinds(page)).includes('gem')).toBe(true);
  const kinds = await markedKinds(page);
  console.log('kinds', JSON.stringify(kinds));
  expect([...new Set(kinds)].sort()).toEqual(['bomb', 'chest', 'ember', 'gem', 'magnet']);
  expect(errors).toEqual([]);
});

test('Pickups Off hides every kind and the kind switches show disabled, values kept (#383)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await seedStorage(
    page,
    saveWith({ [MINIMAP_SETTING_KEYS.gem]: true, [MINIMAP_SETTING_KEYS.relic]: false }),
  );
  await page.goto('/?seed=1&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  await clickRow(page, SCENE.settings, 'Pickups: On');
  await openKinds(page);
  const kindRows = async () =>
    (await menuRows(page, SCENE.settings)).filter((row) =>
      Object.values(KIND_LABELS).some((name) => row.label.startsWith(`${name}:`)),
    );
  expect((await kindRows()).map((row) => row.enabled)).toEqual(Array(7).fill(false));
  expect((await kindRows()).map((row) => row.label)).toEqual([
    'Health: On',
    'Magnet: On',
    'Bomb: On',
    'Chest: On',
    'Relic: Off',
    'Ember: On',
    'XP gems: On',
  ]);
  // A click and the keyboard's Enter on a disabled kind change nothing.
  await clickRow(page, SCENE.settings, 'Health: On');
  await arrowTo(page, 'Health: On');
  await page.keyboard.press('Enter');
  await arrowTo(page, 'Relic: Off');
  await page.keyboard.press('Enter');
  await frames(page, 5);
  expect((await kindRows()).map((row) => row.label)).toEqual([
    'Health: On',
    'Magnet: On',
    'Bomb: On',
    'Chest: On',
    'Relic: Off',
    'Ember: On',
    'XP gems: On',
  ]);
  expect(await storedSettings(page)).toEqual(
    expect.objectContaining({
      [MINIMAP_SETTING_KEYS.pickups]: false,
      [MINIMAP_SETTING_KEYS.gem]: true,
      [MINIMAP_SETTING_KEYS.health]: true,
      [MINIMAP_SETTING_KEYS.relic]: false,
    }),
  );

  await page.keyboard.press('Escape');
  await waitForPage(page, false);
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForScene(page, SCENE.intro);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf('fire'));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await report(page)).world !== null).toBe(true);
  expect(
    await dropAt(page, [
      { kind: 'health', dx: 600, dy: 0 },
      { kind: 'ember', dx: 650, dy: 300 },
      { kind: 'gem', dx: -650, dy: -300 },
    ]),
  ).toBe(3);
  await frames(page, 15);
  const rep = await report(page);
  console.log(
    'pickups off',
    JSON.stringify({ world: rep.world?.pickups.length, map: rep.map?.pickups.length }),
  );
  expect(rep.world?.pickups).toEqual([]);
  expect(rep.map?.pickups).toEqual([]);
  expect(errors).toEqual([]);
});

test('the pickup kinds page opens by click or keyboard and closes by Back or Esc onto its row (#383)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  expect(await selectedLabel(page)).toBeUndefined();

  // Click in, Back click out: the main page highlights the row that opened the page.
  await openKinds(page);
  expect(await sceneTexts(page, SCENE.settings)).toContain('Pickups');
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForPage(page, false);
  expect(await selectedLabel(page)).toBe(KINDS_ROW);

  // Arrows and Enter in, Esc out, the same landing; Esc on the main page then goes to Intro.
  await page.keyboard.press('Enter');
  await waitForPage(page, true);
  expect(await selectedLabel(page)).toBeUndefined();
  await page.keyboard.press('Escape');
  await waitForPage(page, false);
  expect(await selectedLabel(page)).toBe(KINDS_ROW);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);

  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  await arrowTo(page, KINDS_ROW);
  await page.keyboard.press('Enter');
  await waitForPage(page, true);
  expect(errors).toEqual([]);
});

test('the pickup kinds page keeps the pause view: Back and Esc end at Pause (#383)', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  const settingsAt = await page.evaluate(async (pauseKey) => {
    const { game } = await import('/src/main.ts');
    const button = game.scene
      .getScene(pauseKey)
      .children.list.find(
        (child) =>
          child.type === 'Text' && (child as unknown as { text: string }).text === 'Settings',
      ) as unknown as { getCenter(): { x: number; y: number } };
    return button.getCenter();
  }, SCENE.pause);
  await page.mouse.click(settingsAt.x, settingsAt.y);
  await waitForPage(page, false);
  await openKinds(page);
  await page.keyboard.press('Escape');
  await waitForPage(page, false);
  expect(await selectedLabel(page)).toBe(KINDS_ROW);
  await openKinds(page);
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForPage(page, false);
  // The pause view travelled through both trips: Back lands on Pause, with the run still frozen.
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForScene(page, SCENE.pause);
  expect(
    await page.evaluate(async (key) => {
      const { game } = await import('/src/main.ts');
      return game.scene.isActive(key);
    }, SCENE.settings),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test('hundreds of gems leave the relics and rarer drops on the map (#383)', async ({ page }) => {
  const errors = collectErrors(page);
  await seedStorage(page, GEMS_ON);
  await startRun(page);
  // 250 gems off screen on the near side of every other pickup, then a health pickup far out.
  const gems = Array.from({ length: 250 }, (_, i) => ({
    kind: 'gem' as const,
    dx: 520 + (i % 25) * 4,
    dy: Math.floor(i / 25) * 6 - 30,
  }));
  expect(await dropAt(page, [...gems, { kind: 'health', dx: -900, dy: 200 }])).toBe(251);
  await expect.poll(async () => (await markedKinds(page)).includes('health')).toBe(true);
  const read = await page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    const { inView } = await import('/src/core/pickups.ts');
    const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
    const world = rep.world;
    const rare = (world?.pickups ?? []).filter(
      (p) => p.kind !== 'gem' && world && !inView(world.view, p),
    );
    const map = rep.map?.pickups ?? [];
    return {
      gemsInWorld: (world?.pickups ?? []).filter((p) => p.kind === 'gem').length,
      rareOffScreen: rare.length,
      rareDrawn: map.filter((m) => m.kind !== 'gem').length,
      gemsDrawn: map.filter((m) => m.kind === 'gem').length,
      total: map.length,
    };
  }, SCENE.hud);
  console.log('gems', JSON.stringify(read));
  expect(read.gemsInWorld, 'gems in the snapshot').toBeGreaterThanOrEqual(200);
  expect(read.rareOffScreen).toBeGreaterThanOrEqual(2);
  expect(read.rareDrawn, 'every rare pickup off screen is drawn').toBe(read.rareOffScreen);
  expect(read.total).toBe(MINIMAP_MAX_PICKUPS);
  expect(read.gemsDrawn).toBe(MINIMAP_MAX_PICKUPS - read.rareDrawn);
  expect(errors).toEqual([]);
});

/** Every row on the Settings page showing fits the screen, keeps its text inside its bar with slack for taller fonts, and clears the others. */
async function expectRowsFit(page: Page, name: string): Promise<void> {
  const rows = await menuRows(page, SCENE.settings);
  expect(
    rows.map((r) => r.label),
    name,
  ).toContain('Back  (Esc)');
  for (const row of rows) {
    const { x, y, width, height } = row.bounds;
    const at = `${name}: ${row.label}`;
    expect(x, `${at} left`).toBeGreaterThanOrEqual(0);
    expect(y, `${at} top`).toBeGreaterThanOrEqual(0);
    expect(x + width, `${at} right`).toBeLessThanOrEqual(960);
    expect(y + height, `${at} bottom clears the hint bar`).toBeLessThanOrEqual(510);
    const l = row.labelBounds;
    expect(l.x + l.width + 8, `${at} text slack`).toBeLessThanOrEqual(x + width);
    expect(l.y, `${at} text top`).toBeGreaterThanOrEqual(y);
    expect(l.y + l.height, `${at} text bottom`).toBeLessThanOrEqual(y + height);
  }
  for (const [i, a] of rows.entries()) {
    for (const b of rows.slice(i + 1)) {
      const overlap =
        a.bounds.x < b.bounds.x + b.bounds.width &&
        b.bounds.x < a.bounds.x + a.bounds.width &&
        a.bounds.y < b.bounds.y + b.bounds.height &&
        b.bounds.y < a.bounds.y + a.bounds.height;
      expect(overlap, `${name}: ${a.label} overlaps ${b.label}`).toBe(false);
    }
  }
}

test('the rows of both Settings pages, Back included, fit the screen and clear of each other (#383)', async ({
  page,
}) => {
  await page.goto('/?seed=1&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await clickRow(page, SCENE.intro, 'Settings');
  await waitForPage(page, false);
  await expectRowsFit(page, 'main');
  await openKinds(page);
  await expectRowsFit(page, 'pickups');
  // And with Pickups Off, the kinds page's dimmest state.
  await clickRow(page, SCENE.settings, 'Back  (Esc)');
  await waitForPage(page, false);
  await clickRow(page, SCENE.settings, 'Pickups: On');
  await openKinds(page);
  await expectRowsFit(page, 'pickups, Pickups off');
});

test('a full crowd on the Enemies layer holds the fps floor', async ({ page }) => {
  const errors = collectErrors(page);
  await seedStorage(page, saveWith({ [MINIMAP_SETTING_KEYS.enemies]: true }));
  await startRun(page, '&timeScale=10');

  const landed = await page.evaluate(
    async ([gameKey, cap]) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(gameKey) as GameScene).spawnCrowdForTest(cap);
    },
    [SCENE.game, MAX_LIVE_ENEMIES] as const,
  );
  expect(landed, 'crowd spawned').toBeGreaterThanOrEqual(MAX_LIVE_ENEMIES * 0.9);
  await page.waitForTimeout(2000);

  const read = await page.evaluate(
    async ([gameKey, hudKey]) => {
      const { game } = await import('/src/main.ts');
      const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
      return {
        fps: game.loop.actualFps,
        live: (game.scene.getScene(gameKey) as GameScene).liveEnemyCount,
        dots: (rep.map?.enemies.length ?? 0) / 2,
      };
    },
    [SCENE.game, SCENE.hud] as const,
  );
  expect(read.live, 'enemies alive').toBeGreaterThan(0);
  expect(read.dots, 'dots drawn').toBeGreaterThan(0);
  expect(read.fps, `fps over ${read.live} enemies`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});

test('a full crowd with the gem layer on holds the fps floor (#383)', async ({ page }) => {
  const errors = collectErrors(page);
  await seedStorage(
    page,
    saveWith({ [MINIMAP_SETTING_KEYS.enemies]: true, [MINIMAP_SETTING_KEYS.gem]: true }),
  );
  await startRun(page, '&timeScale=10');
  const landed = await page.evaluate(
    async ([gameKey, cap]) => {
      const { game } = await import('/src/main.ts');
      return (game.scene.getScene(gameKey) as GameScene).spawnCrowdForTest(cap);
    },
    [SCENE.game, MAX_LIVE_ENEMIES] as const,
  );
  expect(landed, 'crowd spawned').toBeGreaterThanOrEqual(MAX_LIVE_ENEMIES * 0.9);
  const gems = Array.from({ length: 600 }, (_, i) => ({
    kind: 'gem' as const,
    dx: 520 + (i % 30) * 8,
    dy: Math.floor(i / 30) * 12 - 120,
  }));
  expect(await dropAt(page, gems)).toBe(600);
  await page.waitForTimeout(2000);

  const read = await page.evaluate(
    async ([gameKey, hudKey]) => {
      const { game } = await import('/src/main.ts');
      const rep = (game.scene.getScene(hudKey) as HudScene).minimapReport;
      return {
        fps: game.loop.actualFps,
        live: (game.scene.getScene(gameKey) as GameScene).liveEnemyCount,
        gems: (rep.world?.pickups ?? []).filter((p) => p.kind === 'gem').length,
        drawn: (rep.map?.pickups ?? []).filter((p) => p.kind === 'gem').length,
      };
    },
    [SCENE.game, SCENE.hud] as const,
  );
  console.log('fps', JSON.stringify(read));
  expect(read.live, 'enemies alive').toBeGreaterThan(0);
  expect(read.gems, 'gems in the snapshot').toBeGreaterThan(0);
  expect(read.drawn, 'gem markers drawn').toBeGreaterThan(0);
  expect(read.fps, `fps over ${read.live} enemies and ${read.gems} gems`).toBeGreaterThan(MIN_FPS);
  expect(errors).toEqual([]);
});
