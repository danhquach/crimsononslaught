import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { passiveById, type PassiveId } from '../src/config/passives';
import { relicBuffById, type RelicBuffId } from '../src/config/relics';
import { SPELL_CARDS, SPELL_IDS, type SpellId } from '../src/config/spells';
import { FEEDBACK_SETTING_KEYS } from '../src/config/hitFeedback';
import { AUDIO_SETTING_KEYS } from '../src/config/sounds';
import { abbreviate, itemInfo } from '../src/core/pauseModel';
import { spellGlyph } from '../src/core/hudModel';
import type { PausePayload, ResultPayload } from '../src/core/scenePayloads';
import { AUDIO_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import type { RunState } from '../src/core/runState';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import type { GameScene } from '../src/scenes/GameScene';
import type { PauseScene } from '../src/scenes/PauseScene';
import type { ResultScene } from '../src/scenes/ResultScene';
import { cardCenter, collectErrors, isSceneActive, startFromIntro, waitForScene } from './game';

/**
 * #252 in the browser: Esc or pad Start pauses the run under the pause screen,
 * which shows the build and offers Resume, Settings, Restart, End run and Main
 * menu, the last three behind a Yes / No. Settings (CO-192) opens the Settings
 * panel over the frozen run and goes back to the same pause screen. What the
 * screen lists and which actions ask are `core/pauseModel.test.ts`'s.
 */

const PICKED: SpellId = 'fire';
const TIME_SCALE = 10;

/** The Game scene's private parts these tests reach into. */
interface Inner {
  run: RunState;
  pendingLevelUps: number;
  drainLevelUps(): boolean;
}

async function startRun(page: Page): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&timeScale=${TIME_SCALE}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
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

interface Snapshot {
  gamePaused: boolean;
  pause: PausePayload | null;
  levelUp: boolean;
  /** The HUD hides behind the pause screen and comes back after it. */
  hudVisible: boolean;
  elapsedMs: number;
  kills: number;
  level: number;
  spells: string[];
  /** Wall clock, for how far the run may move in the time since. */
  now: number;
}

/** Every value a check compares, read in one evaluate so the running game cannot move between them. */
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const run = game.scene.getScene(scene.game) as GameScene;
    const inner = run as unknown as Inner;
    return {
      gamePaused: game.scene.isPaused(scene.game),
      pause: game.scene.isActive(scene.pause)
        ? (game.scene.getScene(scene.pause) as PauseScene).view
        : null,
      levelUp: game.scene.isActive(scene.levelUp),
      hudVisible: game.scene.getScene(scene.hud).sys.settings.visible,
      elapsedMs: inner.run.elapsedMs,
      kills: inner.run.kills,
      level: inner.run.level,
      spells: run.equippedSpellIds,
      now: performance.now(),
    };
  }, SCENE);
}

/** Click the pause screen's button with this label, where the scene drew it. */
async function clickButton(page: Page, label: string): Promise<void> {
  const at = await page.evaluate(
    async ([key, text]) => {
      const { game } = await import('/src/main.ts');
      const button = game.scene
        .getScene(key)
        .children.list.find(
          (child) => child.type === 'Text' && (child as unknown as { text: string }).text === text,
        ) as unknown as { getCenter(): { x: number; y: number } } | undefined;
      return button ? button.getCenter() : null;
    },
    [SCENE.pause, label] as const,
  );
  expect(at, `pause button "${label}"`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}

async function waitForPause(page: Page, confirm: PausePayload['confirm']): Promise<void> {
  await expect
    .poll(async () => {
      const { pause } = await snapshot(page);
      return pause === null ? 'closed' : (pause.confirm ?? 'menu');
    })
    .toBe(confirm ?? 'menu');
}

const readStoredSave = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);

/** Standard-mapping pad buttons. */
const A = 0;
const START = 9;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

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

test('Esc pauses the whole run over the build, and Esc resumes it without a jump', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1000);

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  const paused = await snapshot(page);
  expect(paused.gamePaused).toBe(true);
  expect(paused.hudVisible).toBe(false);
  expect(paused.pause?.view.level).toBe(paused.level);
  const { name, color, description } = SPELL_CARDS[PICKED];
  expect(paused.pause?.view.spells).toEqual([{ id: PICKED, name, color, description }]);
  expect(paused.pause?.view.stats.kills).toBe(paused.kills);

  // Frozen: a second of wall time moves nothing (spec: enemies, spells,
  // cooldowns, the clock and pickups all run on the run clock).
  await page.waitForTimeout(1000);
  const later = await snapshot(page);
  expect(later.elapsedMs).toBe(paused.elapsedMs);
  expect(later.kills).toBe(paused.kills);

  // Esc again resumes, and the Esc that closed the screen does not open it again.
  const beforeResume = await snapshot(page);
  await page.keyboard.press('Escape');
  await frames(page, 10);
  const resumed = await snapshot(page);
  expect(resumed.pause).toBeNull();
  expect(resumed.gamePaused).toBe(false);
  expect(resumed.hudVisible).toBe(true);
  expect(resumed.elapsedMs).toBeGreaterThan(beforeResume.elapsedMs);
  // No catch-up: the clock moved about as far as the wall time since at this
  // scale (plus one capped frame of slack), not by the second spent paused.
  const allowed = (resumed.now - beforeResume.now) * TIME_SCALE + 1000;
  expect(resumed.elapsedMs - beforeResume.elapsedMs).toBeLessThan(allowed);
  expect(errors).toEqual([]);
});

test('Restart asks first, then starts the same spell again without banking the run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1500);
  const storedBefore = await readStoredSave(page);
  const listenersBefore = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    return game.events.listenerCount('blur');
  });

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  await clickButton(page, 'Restart');
  await waitForPause(page, 'restart');
  // Declining goes back to the menu, still paused.
  await clickButton(page, 'No');
  await waitForPause(page, undefined);
  expect((await snapshot(page)).gamePaused).toBe(true);

  const before = await snapshot(page);
  await clickButton(page, 'Restart');
  await waitForPause(page, 'restart');
  await clickButton(page, 'Yes');
  await expect.poll(async () => (await snapshot(page)).elapsedMs < before.elapsedMs).toBe(true);
  const restarted = await snapshot(page);
  expect(restarted.pause).toBeNull();
  expect(restarted.gamePaused).toBe(false);
  expect(restarted.spells).toEqual([PICKED]);
  await waitForScene(page, SCENE.hud);
  expect(await readStoredSave(page)).toBe(storedBefore);

  // Nothing stacked: the restarted run holds as many focus listeners as the
  // first, and losing focus opens exactly one pause screen.
  const after = await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    const count = game.events.listenerCount('blur');
    game.events.emit('blur');
    return count;
  });
  expect(after).toBe(listenersBefore);
  await waitForPause(page, undefined);
  expect(errors).toEqual([]);
});

test('End run by keyboard goes to the results with the run banked once', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.waitForTimeout(1500);

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  // The first arrow wakes the highlight on Resume; three more reach End run
  // (past Settings and Restart).
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForPause(page, 'end');
  // Enter with nothing highlighted is No.
  await page.keyboard.press('Enter');
  await waitForPause(page, undefined);
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForPause(page, 'end');
  await page.keyboard.press('ArrowLeft'); // wakes the highlight on Yes
  await page.keyboard.press('Enter');

  await waitForScene(page, SCENE.result);
  // The Enter that confirmed must not also press Play again.
  await frames(page, 10);
  expect(await isSceneActive(page, SCENE.result)).toBe(true);
  const read = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return {
      result: (game.scene.getScene(scene.result) as ResultScene).summary as ResultPayload,
      hud: game.scene.isActive(scene.hud),
      pause: game.scene.isActive(scene.pause),
    };
  }, SCENE);
  expect(read.result.outcome).toBe('ended');
  expect(read.result.stats.timeSurvivedMs).toBeGreaterThan(0);
  // #290: the build Result draws came through the payload guard.
  expect(read.result.build.spells[0]?.id).toBe(PICKED);
  expect(read.hud).toBe(false);
  expect(read.pause).toBe(false);
  const stored = JSON.parse((await readStoredSave(page)) ?? '{}') as {
    currency: number;
    profile: { runs: number; wins: number };
  };
  expect(stored.profile.runs).toBe(1);
  expect(stored.profile.wins).toBe(0);
  expect(stored.currency).toBe(read.result.earned);
  expect(errors).toEqual([]);
});

test('Esc does nothing under the level-up overlay', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page);
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    (game.scene.getScene(key) as unknown as Inner).pendingLevelUps += 1;
  }, SCENE.game);
  await waitForScene(page, SCENE.levelUp);

  await page.keyboard.press('Escape');
  await frames(page, 10);
  const read = await snapshot(page);
  expect(read.levelUp).toBe(true);
  expect(read.pause).toBeNull();
  expect(errors).toEqual([]);
});

test('losing focus on the frame a level-up is queued leaves only the level-up', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page);
  // Phaser pauses Game and launches an overlay on its next step, so the blur
  // lands while Game still reads as running.
  const opened = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const inner = game.scene.getScene(key) as unknown as Inner;
    inner.pendingLevelUps += 1;
    const levelUp = inner.drainLevelUps();
    game.events.emit('blur');
    return levelUp;
  }, SCENE.game);
  expect(opened).toBe(true);
  await waitForScene(page, SCENE.levelUp);
  await frames(page, 10);
  const read = await snapshot(page);
  expect(read.levelUp).toBe(true);
  expect(read.pause).toBeNull();
  expect(errors).toEqual([]);
});

test('a gamepad pauses with Start, resumes with Start, and leaves for the main menu', async ({
  page,
}) => {
  await installPad(page);
  const press = (button: number): Promise<void> => pressPad(page, button);

  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 4); // the first poll after a connect only takes a baseline
  const storedBefore = await readStoredSave(page);

  await press(START);
  await waitForPause(page, undefined);
  await press(START);
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  await frames(page, 4);
  expect((await snapshot(page)).pause).toBeNull();

  await press(START);
  await waitForPause(page, undefined);
  await frames(page, 4);
  await press(DOWN); // wakes the highlight on Resume
  for (let i = 0; i < 4; i += 1) await press(DOWN); // to Main menu
  await press(A);
  await waitForPause(page, 'menu');
  await frames(page, 4);
  await press(RIGHT); // wakes the highlight on Yes
  await press(A);

  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  const read = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return {
      intro: game.scene.isActive(scene.intro),
      game: game.scene.isActive(scene.game) || game.scene.isPaused(scene.game),
      hud: game.scene.isActive(scene.hud),
      pause: game.scene.isActive(scene.pause),
    };
  }, SCENE);
  expect(read).toEqual({ intro: true, game: false, hud: false, pause: false });
  // Abandoned: nothing recorded, nothing banked.
  expect(await readStoredSave(page)).toBe(storedBefore);
  expect(errors).toEqual([]);
});

/** The icons the HUD slots and the pause screen draw, read in one evaluate (CO-170). */
interface IconSample {
  spells: { id: string; name: string; color: number }[];
  hudArt: string[];
  hudTexts: string[];
  pauseArt: { frame: string; scale: number }[];
  /** Each pause text drawn on a filled disc, with that disc's colour. */
  pauseGlyphs: { text: string; color: number }[];
}

function sampleIcons(page: Page): Promise<IconSample> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const pause = game.scene.getScene(scene.pause) as PauseScene;
    const list = (key: string) => game.scene.getScene(key).children.list;
    const icons = (key: string) =>
      (list(key).filter((o) => o.type === 'Image') as unknown as Phaser.GameObjects.Image[]).filter(
        (image) => image.visible && image.frame.name.startsWith('icon.'),
      );
    const discs = list(scene.pause).filter(
      (o) => o.type === 'Arc' && (o as Phaser.GameObjects.Arc).isFilled,
    ) as unknown as Phaser.GameObjects.Arc[];
    const texts = (key: string) =>
      list(key).filter((o) => o.type === 'Text') as unknown as Phaser.GameObjects.Text[];
    return {
      spells: [...(pause.view?.view.spells ?? [])],
      hudArt: icons(scene.hud).map((image) => image.frame.name),
      hudTexts: texts(scene.hud).map((text) => text.text),
      pauseArt: icons(scene.pause).map((image) => ({
        frame: image.frame.name,
        scale: image.displayWidth / image.width,
      })),
      pauseGlyphs: texts(scene.pause).flatMap((text) => {
        // The top-most filled disc under the text's centre, as it draws.
        const disc = discs.findLast(
          (d) => d.fillColor !== 0 && Math.hypot(d.x - text.x, d.y - text.y) < 1,
        );
        return disc ? [{ text: text.text, color: disc.fillColor }] : [];
      }),
    };
  }, SCENE);
}

/** Passives and relic buffs to take, one rank each, before pausing. */
interface Extras {
  passives?: readonly PassiveId[];
  relics?: readonly RelicBuffId[];
}

async function pauseWithLoadout(
  page: Page,
  loadout: readonly string[],
  extras: Extras = {},
): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&loadout=${loadout.join(',')}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await expect.poll(async () => (await snapshot(page)).spells.length).toBe(1 + loadout.length);
  await page.evaluate(
    async ([key, { passives = [], relics = [] }]) => {
      const { game } = await import('/src/main.ts');
      const { spells } = game.scene.getScene(key) as unknown as {
        spells: { takePassive(id: string): void; takeRelic(id: string): void };
      };
      for (const id of passives) spells.takePassive(id);
      for (const id of relics) spells.takeRelic(id);
    },
    [SCENE.game, extras] as const,
  );
  await frames(page, 4); // the HUD has drawn every slot
  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
}

const ICON_LOADOUT = ['lightning_tornado', 'earth_quake'] as const;

test('the pause screen draws each spell icon as its HUD slot does, at a whole-number scale', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await pauseWithLoadout(page, ICON_LOADOUT);

  const sample = await sampleIcons(page);
  const frames = [PICKED, ...ICON_LOADOUT].map((id) => `icon.${id}.0.art`);
  expect(sample.hudArt).toEqual(frames);
  expect(sample.pauseArt).toEqual(frames.map((frame) => ({ frame, scale: 1 })));
  expect(sample.pauseGlyphs).toEqual([]);
  expect(errors).toEqual([]);
});

test('with no icon art, the pause screen shows the HUD slot letters on the spell colour', async ({
  page,
}) => {
  // The icons' page failing takes every atlas page down with it (CO-130).
  await page.route('**/assets/atlas/props10.png', (route) => route.abort());
  await pauseWithLoadout(page, ICON_LOADOUT);

  const sample = await sampleIcons(page);
  expect(sample.pauseArt).toEqual([]);
  expect(sample.spells.map((spell) => spell.id)).toEqual([PICKED, ...ICON_LOADOUT]);
  const expected = sample.spells.map((spell) => ({
    text: spellGlyph(spell.name),
    color: spell.color,
  }));
  expect(sample.pauseGlyphs).toEqual(expected);
  // The ticket's cases: one letter, not "To" / "Ea".
  expect(expected.slice(1).map((glyph) => glyph.text)).toEqual(['T', 'E']);
  for (const { text } of expected) expect(sample.hudTexts).toContain(text);
});

/**
 * CO-179: the roster's longest name beside three more spells, two passives on
 * one row and a relic below them.
 */
const LONG_LOADOUT = ['lightning_companion', 'lightning_chain', 'earth_companion'] as const;
const BUILD: Required<Extras> = {
  passives: ['passive_power', 'passive_haste'],
  relics: ['relic_hourglass'],
};

/** The spell strip's frame and every text drawn inside its band, read in one evaluate. */
function sampleStrip(page: Page) {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const scene = game.scene.getScene(key);
    const texts = scene.children.list.filter(
      (o) => o.type === 'Text',
    ) as unknown as Phaser.GameObjects.Text[];
    // The strip is the first filled rectangle the screen draws after its backdrop.
    const strip = (scene.children.list as Phaser.GameObjects.Rectangle[]).find(
      (o) => o.type === 'Rectangle' && o.isFilled && o.fillColor === 0x17110f,
    );
    const box = strip?.getBounds();
    const inBand = (t: Phaser.GameObjects.Text) =>
      box !== undefined && t.y > box.y + 30 && t.y < box.bottom;
    return {
      strip: box ? { x: box.x, y: box.y, right: box.right, bottom: box.bottom } : null,
      names: texts.filter(inBand).map((t) => {
        const b = t.getBounds();
        return { text: t.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom };
      }),
      icons: (scene.children.list as Phaser.GameObjects.Image[])
        .filter((o) => o.type === 'Image' && o.frame.name.startsWith('icon.'))
        .map((o) => o.frame.name),
    };
  }, SCENE.pause);
}

const readNav = (page: Page) =>
  page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(key) as PauseScene).nav;
  }, SCENE.pause);

test('every spell name fits inside the Spells strip, and passives and relics wear icons', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await pauseWithLoadout(page, LONG_LOADOUT, BUILD);

  const sample = await sampleStrip(page);
  expect(sample.strip).not.toBeNull();
  const strip = sample.strip!;
  // Four names, each on one line, inside the strip's frame.
  expect(sample.names).toHaveLength(1 + LONG_LOADOUT.length);
  for (const name of sample.names) {
    expect(name.text, name.text).not.toContain('\n');
    expect(name.x, name.text).toBeGreaterThanOrEqual(strip.x);
    expect(name.right, name.text).toBeLessThanOrEqual(strip.right);
    expect(name.bottom, name.text).toBeLessThanOrEqual(strip.bottom);
  }
  // Names do not run into one another.
  const sorted = [...sample.names].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i += 1) {
    expect(sorted[i]!.x).toBeGreaterThan(sorted[i - 1]!.right);
  }

  // Each passive and relic draws its own icon art, not its letters.
  const expected = [...BUILD.passives, ...BUILD.relics].map((id) => `icon.${id}.0.art`);
  for (const frame of expected) expect(sample.icons).toContain(frame);
  expect(errors).toEqual([]);
});

test('the arrows walk from the menu through every strip and read each item', async ({ page }) => {
  const errors = collectErrors(page);
  await pauseWithLoadout(page, LONG_LOADOUT, BUILD);
  const info = (id: string, kind: 'spell' | 'passive' | 'relic'): string => {
    if (kind === 'spell') {
      const card = SPELL_CARDS[id as SpellId];
      return card ? itemInfo({ ...card, id }) : id;
    }
    const entry = kind === 'passive' ? passiveById(id) : relicBuffById(id);
    return itemInfo({ id, name: entry!.name, abbr: '', description: entry!.description, count: 1 });
  };

  expect((await readNav(page)).focus).toBeNull();
  await page.keyboard.press('ArrowDown'); // wakes the highlight on Resume
  await page.keyboard.press('ArrowDown'); // Settings
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 1 });

  await page.keyboard.press('ArrowRight');
  let nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 0, col: 0 });
  expect(nav.info).toBe(info(PICKED, 'spell'));
  expect(nav.cursor).not.toBeNull();

  // The long name reads whole on the info line, however it fits under its icon.
  await page.keyboard.press('ArrowRight');
  nav = await readNav(page);
  expect(nav.info).toContain('Lightning Companion');
  const spellCursor = nav.cursor;

  await page.keyboard.press('ArrowDown');
  nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 1 });
  expect([info('passive_power', 'passive'), info('passive_haste', 'passive')]).toContain(nav.info);
  expect(nav.cursor).not.toEqual(spellCursor);

  await page.keyboard.press('ArrowDown');
  nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 2, col: 0 });
  expect(nav.info).toBe(info('relic_hourglass', 'relic'));

  // The mouse still reads a tile, and the pad's item comes back when it leaves.
  const tile = nav.cursor!;
  await page.mouse.move(tile.x, tile.y - 132); // the passive row above
  await expect.poll(async () => (await readNav(page)).info).toBe(info('passive_power', 'passive'));
  await page.mouse.move(5, 5);
  await expect.poll(async () => (await readNav(page)).info).toBe(info('relic_hourglass', 'relic'));

  // Left off the row's first item goes back to the menu row it came from.
  await page.keyboard.press('ArrowLeft');
  nav = await readNav(page);
  expect(nav.focus).toEqual({ zone: 'menu', index: 1 });
  expect(nav.cursor).toBeNull();

  // Esc still resumes.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  expect(errors).toEqual([]);
});

test('a gamepad reaches the spells, passives and relics, and Start still resumes', async ({
  page,
}) => {
  await installPad(page);
  const errors = collectErrors(page);
  await pauseWithLoadout(page, LONG_LOADOUT, BUILD);
  await frames(page, 4); // the first poll after a connect only takes a baseline

  await pressPad(page, DOWN); // wakes the highlight on Resume
  await pressPad(page, RIGHT);
  let nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 0, col: 0 });
  expect(nav.info).toContain(SPELL_CARDS[PICKED].name);

  // Down lands on the passive nearest across: the second, under the first spell.
  await pressPad(page, DOWN);
  nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 1, col: 1 });
  expect(nav.info).toContain(passiveById('passive_haste')!.name);
  await pressPad(page, LEFT);
  expect((await readNav(page)).info).toContain(passiveById('passive_power')!.name);

  await pressPad(page, DOWN);
  nav = await readNav(page);
  expect(nav.focus).toMatchObject({ zone: 'build', row: 2 });
  expect(nav.info).toContain(relicBuffById('relic_hourglass')!.name);
  // A on a strip item does nothing.
  await pressPad(page, A);
  const after = await snapshot(page);
  expect(after.pause).not.toBeNull();
  expect(after.pause?.confirm).toBeUndefined();
  expect((await readNav(page)).focus).toEqual(nav.focus);

  await pressPad(page, UP);
  expect((await readNav(page)).focus).toMatchObject({ zone: 'build', row: 1, col: 0 });
  await pressPad(page, LEFT);
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 0 });
  await pressPad(page, START);
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  expect(errors).toEqual([]);
});

test('with no icon art, passives and relics keep their letters and badges', async ({ page }) => {
  // The build icons' page failing takes every atlas page down with it (CO-130).
  await page.route('**/assets/atlas/props17.png', (route) => route.abort());
  await pauseWithLoadout(page, LONG_LOADOUT, BUILD);

  const read = await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const list = game.scene.getScene(key).children.list;
    return {
      icons: (list as Phaser.GameObjects.Image[])
        .filter((o) => o.type === 'Image' && o.frame.name.startsWith('icon.'))
        .map((o) => o.frame.name),
      texts: (list as Phaser.GameObjects.Text[])
        .filter((o) => o.type === 'Text')
        .map((o) => o.text),
    };
  }, SCENE.pause);
  expect(read.icons).toEqual([]);
  for (const id of [...BUILD.passives, ...BUILD.relics]) {
    const name = (passiveById(id) ?? relicBuffById(id))!.name;
    expect(read.texts, id).toContain(abbreviate(name));
  }
});

/**
 * CO-192: Settings from the pause menu. Positions mirror `SettingsScene`: rows
 * 58 px apart from y = 140, master volume's "-" 70 px left of the value 120 px
 * right of centre, switches 120 px right of centre; Intro's Settings entry.
 */
const MASTER_DOWN = { x: 480 + 120 - 70, y: 140 };
const SHAKE_SWITCH = { x: 600, y: 140 + 5 * 58 };
const INTRO_SETTINGS = { x: 480, y: 298 };

/** What the pause -> Settings tests compare, read in one evaluate so the running game cannot move between them. */
interface Panel {
  settingsActive: boolean;
  pauseActive: boolean;
  gamePaused: boolean;
  introActive: boolean;
  hudVisible: boolean;
  /** Settings is the last scene in the draw order, so it draws over Game, HUD and Pause. */
  settingsOnTop: boolean;
  elapsedMs: number;
  kills: number;
  track: string | null;
  runTrack: string | null;
  master: number;
  /** The Game scene's live feedback settings, and how many times Settings has been created. */
  feedbackShake: number;
  creates: number;
}

function readPanel(page: Page): Promise<Panel> {
  return page.evaluate(
    async ([scene, audioKey]) => {
      const { game } = await import('/src/main.ts');
      const inner = game.scene.getScene(scene.game) as unknown as Inner & {
        feedback: { shake: number };
      };
      const audio = game.registry.get(audioKey) as Audio;
      const order = game.scene.getScenes(false).map((s) => s.sys.settings.key);
      return {
        settingsActive: game.scene.isActive(scene.settings),
        pauseActive: game.scene.isActive(scene.pause),
        gamePaused: game.scene.isPaused(scene.game),
        introActive: game.scene.isActive(scene.intro),
        hudVisible: game.scene.getScene(scene.hud).sys.settings.visible,
        settingsOnTop: order.indexOf(scene.settings) > order.indexOf(scene.pause),
        elapsedMs: inner.run.elapsedMs,
        kills: inner.run.kills,
        track: audio.music.track,
        runTrack: audio.music.run?.run ?? null,
        master: audio.settings.master,
        feedbackShake: inner.feedback.shake,
        creates: (window as unknown as { settingsCreates?: number }).settingsCreates ?? 0,
      };
    },
    [SCENE, AUDIO_REGISTRY_KEY] as const,
  );
}

/** Count Settings' creations; call before opening it. The scene's emitter outlives its restarts. */
function countSettingsCreates(page: Page): Promise<void> {
  return page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const w = window as unknown as { settingsCreates?: number };
    w.settingsCreates = 0;
    game.scene.getScene(key).events.on('create', () => (w.settingsCreates! += 1));
  }, SCENE.settings);
}

async function pauseRun(page: Page): Promise<void> {
  await startRun(page);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
}

test('Settings opens from the pause menu over the frozen run, and Back returns to the same pause screen', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await pauseRun(page);
  const before = await snapshot(page);
  await countSettingsCreates(page);

  // Straight away: no Yes / No, no run left behind.
  await clickButton(page, 'Settings');
  await waitForScene(page, SCENE.settings);
  await expect.poll(async () => (await readPanel(page)).pauseActive).toBe(false);
  const open = await readPanel(page);
  expect(open.creates).toBe(1);
  expect(open.gamePaused).toBe(true);
  expect(open.hudVisible).toBe(false);
  expect(open.settingsOnTop).toBe(true);
  // The run's own track keeps playing; the menu track never comes in.
  expect(open.runTrack).not.toBeNull();
  expect(open.track).toBe(open.runTrack);

  // Frozen for as long as the panel is open.
  await page.waitForTimeout(600);
  const later = await readPanel(page);
  expect(later.elapsedMs).toBe(open.elapsedMs);
  expect(later.kills).toBe(open.kills);
  expect(later.track).toBe(open.runTrack);

  // Volume and shake changes land at once and are saved as from the main menu.
  await page.mouse.click(MASTER_DOWN.x, MASTER_DOWN.y);
  await page.mouse.click(SHAKE_SWITCH.x, SHAKE_SWITCH.y);
  await expect
    .poll(async () => JSON.parse((await readStoredSave(page)) ?? '{"settings":{}}').settings)
    .toEqual(
      expect.objectContaining({
        [AUDIO_SETTING_KEYS.master]: 0.9,
        [FEEDBACK_SETTING_KEYS.shake]: 0,
      }),
    );
  expect((await readPanel(page)).master).toBe(0.9);

  // Esc goes back to the pause screen with the same build, still frozen.
  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  await waitForScene(page, SCENE.pause);
  const back = await snapshot(page);
  expect(back.pause?.view).toEqual(before.pause?.view);
  expect(back.gamePaused).toBe(true);
  expect(back.hudVisible).toBe(false);
  expect(back.elapsedMs).toBe(before.elapsedMs);
  const closed = await readPanel(page);
  expect(closed.settingsActive).toBe(false);
  expect(closed.creates).toBe(1);

  // Resume: the run picks the new feedback up without a restart.
  await clickButton(page, 'Resume');
  await expect.poll(async () => (await readPanel(page)).gamePaused).toBe(false);
  await frames(page, 4);
  const resumed = await readPanel(page);
  expect(resumed.feedbackShake).toBe(0);
  expect(resumed.master).toBe(0.9);
  expect(resumed.hudVisible).toBe(true);
  expect(resumed.pauseActive).toBe(false);
  expect(resumed.settingsActive).toBe(false);
  expect(resumed.elapsedMs).toBeGreaterThan(before.elapsedMs);
  expect(errors).toEqual([]);
});

test('arrows + Enter open Settings from the pause menu, and Esc goes back', async ({ page }) => {
  const errors = collectErrors(page);
  await pauseRun(page);
  const before = await snapshot(page);

  // The first arrow wakes the highlight on Resume; the next is Settings.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect((await readNav(page)).focus).toEqual({ zone: 'menu', index: 1 });
  await page.keyboard.press('Enter');
  await waitForScene(page, SCENE.settings);
  await frames(page, 10);
  const open = await readPanel(page);
  expect(open.gamePaused).toBe(true);
  expect(open.pauseActive).toBe(false);

  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);
  const back = await snapshot(page);
  expect(back.pause?.view).toEqual(before.pause?.view);
  expect(back.gamePaused).toBe(true);
  // The Esc that closed Settings does not also resume the run.
  await frames(page, 10);
  expect((await snapshot(page)).gamePaused).toBe(true);

  // Enter with nothing highlighted is still Resume.
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  expect(errors).toEqual([]);
});

test('a gamepad opens Settings from the pause menu, and Start goes back to it', async ({
  page,
}) => {
  await installPad(page);
  const errors = collectErrors(page);
  await startRun(page);
  await frames(page, 4); // the first poll after a connect only takes a baseline

  await pressPad(page, START);
  await waitForPause(page, undefined);
  const before = await snapshot(page);
  await frames(page, 4);
  await pressPad(page, DOWN); // wakes the highlight on Resume
  await pressPad(page, DOWN); // Settings
  await pressPad(page, A);
  await waitForScene(page, SCENE.settings);
  await frames(page, 4);
  expect((await readPanel(page)).gamePaused).toBe(true);

  await pressPad(page, START);
  await waitForPause(page, undefined);
  await frames(page, 4);
  const back = await snapshot(page);
  expect(back.pause?.view).toEqual(before.pause?.view);
  // The Start that closed Settings does not also resume the run.
  expect(back.gamePaused).toBe(true);
  expect((await readPanel(page)).settingsActive).toBe(false);

  await pressPad(page, START);
  await expect.poll(async () => (await snapshot(page)).gamePaused).toBe(false);
  expect(errors).toEqual([]);
});

test('a click and a key in one frame open Settings once and never resume the run with it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await pauseRun(page);
  await countSettingsCreates(page);

  // Both paths end in the pause screen's `choose`; fire it three times in one frame.
  await page.evaluate(async (key) => {
    const { game } = await import('/src/main.ts');
    const pause = game.scene.getScene(key) as unknown as {
      view: PausePayload;
      choose(action: string, view: unknown): void;
    };
    const { view } = pause.view;
    pause.choose('settings', view);
    pause.choose('settings', view);
    pause.choose('resume', view);
  }, SCENE.pause);
  await waitForScene(page, SCENE.settings);
  // Sample past the frames the first step's leftovers would land in.
  for (let i = 0; i < 3; i += 1) {
    await frames(page, 5);
    const read = await readPanel(page);
    expect(read.creates).toBe(1);
    expect(read.settingsActive).toBe(true);
    expect(read.pauseActive).toBe(false);
    expect(read.gamePaused).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('losing focus while Settings is open neither reopens Pause nor resumes the run', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await pauseRun(page);
  await clickButton(page, 'Settings');
  await waitForScene(page, SCENE.settings);
  const before = await readPanel(page);

  await page.evaluate(async () => {
    const { game } = await import('/src/main.ts');
    game.events.emit('blur');
    game.events.emit('hidden');
  });
  await frames(page, 10);
  const after = await readPanel(page);
  expect(after.settingsActive).toBe(true);
  expect(after.pauseActive).toBe(false);
  expect(after.gamePaused).toBe(true);
  expect(after.elapsedMs).toBe(before.elapsedMs);
  expect(errors).toEqual([]);
});

test('the main menu Settings still goes back to Intro after a pause Settings', async ({ page }) => {
  const errors = collectErrors(page);
  await pauseRun(page);
  await clickButton(page, 'Settings');
  await waitForScene(page, SCENE.settings);
  await page.keyboard.press('Escape');
  await waitForPause(page, undefined);

  // Leave the run through Main menu -> Yes.
  await clickButton(page, 'Main menu');
  await waitForPause(page, 'menu');
  await clickButton(page, 'Yes');
  await waitForScene(page, SCENE.intro);
  await frames(page, 10);

  // Intro starts Settings with no payload; Phaser would replay the pause one.
  await page.mouse.click(INTRO_SETTINGS.x, INTRO_SETTINGS.y);
  await waitForScene(page, SCENE.settings);
  const menu = await page.evaluate(async (audioKey) => {
    const { game } = await import('/src/main.ts');
    return (game.registry.get(audioKey) as Audio).music.track;
  }, AUDIO_REGISTRY_KEY);
  expect(menu).toBe('music.menu');
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.intro);
  await frames(page, 10);
  const read = await page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    return {
      intro: game.scene.isActive(scene.intro),
      settings: game.scene.isActive(scene.settings),
      pause: game.scene.isActive(scene.pause),
      game: game.scene.isActive(scene.game) || game.scene.isPaused(scene.game),
    };
  }, SCENE);
  expect(read).toEqual({ intro: true, settings: false, pause: false, game: false });
  expect(errors).toEqual([]);
});
