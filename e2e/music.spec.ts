import { expect, test, type Page } from '@playwright/test';
import {
  AUDIO_SETTING_KEYS,
  BOSS_TRACKS,
  MUSIC,
  MUSIC_KEYS,
  RUN_TRACKS,
  type MusicKey,
} from '../src/config/sounds';
import { emptySave } from '../src/core/save';
import { AUDIO_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * Music (CO-157) in the browser: the menu track comes in with the first key
 * or click and carries across the menus, a run switches to the run track it
 * drew, the boss to the boss track it drew, and Result fades it out, win or
 * lose. A level-up and
 * the pause screen leave the track playing, never restarted, and leaving
 * the run by the pause screen's Main menu brings the menu track back. Music volume in
 * Settings reaches the playing track at once and is saved.
 *
 * What is heard is the fade and the volume (`core/musicMix.test.ts`); this
 * reads the `Audio` in the registry and counts `play` on each track's Phaser
 * sound, so a restart would show as a second play.
 */

/** Settings' Music volume "−": row 1, 70 px left of the value 120 px right of centre. */
const MUSIC_DOWN = { x: 480 + 120 - 70, y: 140 + 58 };

interface MusicSnapshot {
  track: MusicKey | null;
  /** The pair this run drew, once a run has started. */
  run: { run: MusicKey; boss: MusicKey } | null;
  gains: Record<string, number>;
  /** `play` calls per track since `watchTracks`. */
  plays: Record<string, number>;
  /** Tracks whose Phaser sound is playing, and the volume last set on it. */
  playing: Record<string, number>;
  musicSetting: number;
}

/** Count `play` on every music sound, those already added and any added later. Idempotent. */
async function watchTracks(page: Page): Promise<void> {
  await page.evaluate(
    async (keys) => {
      const { game } = await import('/src/main.ts');
      const w = window as unknown as { trackPlays?: Record<string, number> };
      if (w.trackPlays) return;
      const plays: Record<string, number> = {};
      w.trackPlays = plays;
      const wrap = (sound: { key: string; play: (...a: unknown[]) => boolean }): void => {
        if (!keys.includes(sound.key)) return;
        const play = sound.play.bind(sound);
        sound.play = (...args) => {
          plays[sound.key] = (plays[sound.key] ?? 0) + 1;
          return play(...args);
        };
      };
      const manager = game.sound as unknown as {
        sounds: Parameters<typeof wrap>[0][];
        add: (...a: unknown[]) => Parameters<typeof wrap>[0];
      };
      manager.sounds.forEach(wrap);
      const add = manager.add.bind(manager);
      manager.add = (...args) => {
        const sound = add(...args);
        wrap(sound);
        return sound;
      };
    },
    MUSIC_KEYS as readonly string[],
  );
}

async function music(page: Page): Promise<MusicSnapshot> {
  return page.evaluate(
    async ([registryKey, keys]) => {
      const { game } = await import('/src/main.ts');
      const audio = game.registry.get(registryKey) as Audio;
      const playing: Record<string, number> = {};
      for (const sound of game.sound.getAllPlaying())
        if (keys.includes(sound.key))
          playing[sound.key] = (
            sound as unknown as { currentConfig: { volume: number } }
          ).currentConfig.volume;
      return {
        track: audio.music.track,
        run: audio.music.run,
        gains: { ...audio.music.gains },
        plays: {
          ...((window as unknown as { trackPlays?: Record<string, number> }).trackPlays ?? {}),
        },
        playing,
        musicSetting: audio.settings.music,
      };
    },
    [AUDIO_REGISTRY_KEY, MUSIC_KEYS as readonly string[]] as const,
  );
}

/** Wait until `key` is the one track heard, faded all the way in. */
async function settledOn(page: Page, key: MusicKey | null): Promise<MusicSnapshot> {
  await expect
    .poll(
      async () => {
        const { track, gains } = await music(page);
        return { track, gains };
      },
      { message: `music settles on ${key}`, timeout: 10_000 },
    )
    .toEqual({ track: key, gains: key ? { [key]: 1 } : {} });
  return music(page);
}

/** Click the pause screen's button with this label, where the scene drew it (as `pause.spec.ts` does). */
async function clickPauseButton(page: Page, label: string): Promise<void> {
  await expect
    .poll(() => pauseButtonAt(page, label), { message: `pause button "${label}"` })
    .not.toBeNull();
  const at = await pauseButtonAt(page, label);
  await page.mouse.click(at!.x, at!.y);
}

function pauseButtonAt(page: Page, label: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    async ([key, text]) => {
      const { game } = await import('/src/main.ts');
      if (!game.scene.isActive(key)) return null;
      const button = game.scene
        .getScene(key)
        .children.list.find(
          (child) => child.type === 'Text' && (child as unknown as { text: string }).text === text,
        ) as unknown as { getCenter(): { x: number; y: number } } | undefined;
      return button ? button.getCenter() : null;
    },
    [SCENE.pause, label] as const,
  );
}

async function storedMusic(page: Page): Promise<unknown> {
  const json = await page.evaluate((k) => localStorage.getItem(k), SAVE_STORAGE_KEY);
  return (JSON.parse(json ?? '{"settings":{}}') as { settings: Record<string, unknown> }).settings[
    AUDIO_SETTING_KEYS.music
  ];
}

test('the menu track carries across the menus, and a run, a level-up and the pause screen keep the run track', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=1&timeScale=10&invulnerable=1');
  await waitForScene(page, SCENE.intro);
  await watchTracks(page);
  expect((await music(page)).track).toBe('music.menu');

  // The first key press is the gesture that lets the browser play audio.
  await page.keyboard.press('ArrowDown');
  await page.mouse.click(480, 298);
  await waitForScene(page, SCENE.settings);
  const menu = await settledOn(page, 'music.menu');
  expect(menu.plays).toEqual({ 'music.menu': 1 });
  expect(menu.playing['music.menu']).toBeCloseTo(MUSIC['music.menu'].volume, 5);

  // Music volume: a notch down reaches the playing track at once and is saved.
  await page.mouse.click(MUSIC_DOWN.x, MUSIC_DOWN.y);
  await expect.poll(async () => (await music(page)).musicSetting).toBe(0.9);
  expect((await music(page)).playing['music.menu']).toBeCloseTo(
    MUSIC['music.menu'].volume * 0.9,
    5,
  );
  await expect.poll(() => storedMusic(page)).toBe(0.9);

  // Back to Intro and on to SpellSelect: the same track, never restarted.
  await page.keyboard.press('Escape');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  expect((await music(page)).plays).toEqual({ 'music.menu': 1 });

  const { x, y } = cardCenter(0);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  const pair = (await music(page)).run;
  expect(pair).not.toBeNull();
  expect(RUN_TRACKS).toContain(pair!.run);
  expect(BOSS_TRACKS).toContain(pair!.boss);
  const runTrack = pair!.run;
  const run = await settledOn(page, runTrack);
  expect(run.plays).toEqual({ 'music.menu': 1, [runTrack]: 1 });
  expect(Object.keys(run.playing)).toEqual([runTrack]);

  // A level-up pauses the run, never the track.
  await waitForScene(page, SCENE.levelUp);
  const offered = await music(page);
  expect(offered.track).toBe(runTrack);
  expect(offered.plays).toEqual(run.plays);
  expect(Object.keys(offered.playing)).toEqual([runTrack]);
  await page.keyboard.press('1');

  // Nor does the pause screen.
  await expect
    .poll(() =>
      page.evaluate(async (key) => {
        const { game } = await import('/src/main.ts');
        return game.scene.isActive(key);
      }, SCENE.levelUp),
    )
    .toBe(false);
  await page.keyboard.press('Escape');
  await waitForScene(page, SCENE.pause);
  const paused = await music(page);
  expect(paused.track).toBe(runTrack);
  expect(paused.plays).toEqual(run.plays);
  expect(Object.keys(paused.playing)).toEqual([runTrack]);

  // Main menu from the pause screen abandons the run without Result: the
  // menu screen it lands on brings the menu track back.
  await clickPauseButton(page, 'Main menu');
  await clickPauseButton(page, 'Yes');
  await waitForScene(page, SCENE.intro);
  const back = await settledOn(page, 'music.menu');
  expect(Object.keys(back.playing)).toEqual(['music.menu']);

  expect(errors).toEqual([]);
});

for (const outcome of ['win', 'lose'] as const) {
  test(`the boss brings in the boss track, and Result fades it out on a ${outcome}`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    // 5 s of waves before the boss at 20:00.
    await page.goto('/?seed=1&timeScale=10&invulnerable=1&startAt=1195');
    await startFromIntro(page);
    await waitForScene(page, SCENE.spellSelect);
    await watchTracks(page);
    const { x, y } = cardCenter(0);
    await page.mouse.click(x, y);
    await waitForScene(page, SCENE.game);

    // A level-up in the 5 s before the boss would pause Game short of it:
    // answer any with its first card until the boss track is asked for.
    await expect
      .poll(
        async () => {
          const { music: now, levelUp } = await page.evaluate(
            async ([registryKey, levelUpKey]) => {
              const { game } = await import('/src/main.ts');
              return {
                music: (game.registry.get(registryKey) as Audio).music,
                levelUp: game.scene.isActive(levelUpKey),
              };
            },
            [AUDIO_REGISTRY_KEY, SCENE.levelUp] as const,
          );
          if (levelUp) await page.keyboard.press('1');
          return now.run !== null && now.track === now.run.boss;
        },
        { message: "the boss spawns and asks for the run's boss track", timeout: 15_000 },
      )
      .toBe(true);
    const bossTrack = (await music(page)).run!.boss;
    expect(BOSS_TRACKS).toContain(bossTrack);
    const boss = await settledOn(page, bossTrack);
    expect(boss.plays[bossTrack]).toBe(1);
    expect(Object.keys(boss.playing)).toEqual([bossTrack]);

    // How the run ends is Game's business (fullRun, pause specs); Result
    // fades the track out the same way for every outcome.
    await page.evaluate(
      async ([gameKey, how]) => {
        const { game } = await import('/src/main.ts');
        (game.scene.getScene(gameKey) as unknown as { endRun(o: string): void }).endRun(how);
      },
      [SCENE.game, outcome] as const,
    );
    await waitForScene(page, SCENE.result);
    const after = await settledOn(page, null);
    expect(after.playing).toEqual({});

    expect(errors).toEqual([]);
  });
}

/** A stored music volume the panel could never have written: defaulted or clamped before it plays. */
const HOSTILE_MUSIC: readonly (readonly [unknown, number])[] = [
  [5, 1],
  [-1, 0],
  ['<img src=x onerror=alert(1)>', 1],
];

for (const [stored, expected] of HOSTILE_MUSIC) {
  test(`a stored music volume of ${JSON.stringify(stored)} plays the menu track at ${expected}`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const save = { ...emptySave(), settings: { [AUDIO_SETTING_KEYS.music]: stored } };
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: SAVE_STORAGE_KEY,
      value: JSON.stringify(save),
    });
    await page.goto('/?seed=1');
    await waitForScene(page, SCENE.intro);
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => (await music(page)).gains, { timeout: 10_000 })
      .toEqual({ 'music.menu': 1 });
    const menu = await music(page);
    expect(menu.musicSetting).toBe(expected);
    expect(menu.playing['music.menu']).toBeCloseTo(MUSIC['music.menu'].volume * expected, 5);
    expect(errors).toEqual([]);
  });
}
