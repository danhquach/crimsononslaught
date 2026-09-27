import { expect, type Page } from '@playwright/test';
import { SOUNDS, type SoundKey } from '../src/config/sounds';
import { SPELL_IDS } from '../src/config/spells';
import type { HudModel } from '../src/core/hudModel';
import { AUDIO_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import type { HudScene } from '../src/scenes/HudScene';

/**
 * Helpers shared by the browser suites. Everything they read comes through
 * `game` exported by `src/main.ts`, which the Vite dev server hands back as the
 * very module `index.html` loaded (`tsconfig.e2e.json` maps that URL onto the
 * source file for type-checking).
 */

/**
 * The floor `game.loop.actualFps` must hold at in every suite that reads it.
 * A desktop holds 60 fps and the check is for a collapse — a pool thrashing, a
 * leak, a membership test gone quadratic — not a tuned number. The CI runner
 * draws about 10 fps (#94, see `forceFrameLength`), so there the floor only
 * catches a stalled loop (#260).
 */
export const MIN_FPS = process.env.CI ? 5 : 20;

export function isSceneActive(page: Page, key: string): Promise<boolean> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(sceneKey);
  }, key);
}

/**
 * Polls through `expect.poll`, which awaits the predicate's promise;
 * `page.waitForFunction` would take the pending promise of an async predicate
 * as its truthy result and return at once.
 */
export async function waitForScene(page: Page, key: string): Promise<void> {
  await expect
    .poll(() => isSceneActive(page, key), { message: `scene ${key} is active`, timeout: 15_000 })
    .toBe(true);
}

/** The HUD's own view-model (`HudScene.view`), not the Game scene's internals. */
export async function readHud(page: Page): Promise<HudModel> {
  return page.evaluate(async (hudKey) => {
    const { game } = await import('/src/main.ts');
    return (game.scene.getScene(hudKey) as HudScene).view;
  }, SCENE.hud);
}

/**
 * Centre of the i-th spell card in game pixels, mirroring the row layout in
 * `SpellSelectScene` (four 200 x 332 px cards, 24 px apart, top edge at
 * y = 150, centred on a 960 px wide canvas). The viewport matches the canvas,
 * so these are page coordinates too; a drifted layout fails the "Game started"
 * wait.
 */
export function cardCenter(index: number): { x: number; y: number } {
  const width = 200;
  const gap = 24;
  const rowWidth = SPELL_IDS.length * width + (SPELL_IDS.length - 1) * gap;
  return { x: (960 - rowWidth) / 2 + width / 2 + index * (width + gap), y: 150 + 332 / 2 };
}

/**
 * Pin the game loop to one frame every `frameMs` of wall clock, the way a slow
 * runner renders (#94: CI draws about 10 fps). Phaser's loop is a
 * `requestAnimationFrame` driver with a setTimeout mode; this restarts it in
 * that mode at the given interval, so every frame's delta — and with it the run
 * time a frame covers at `?timeScale=` — is what the runner would see.
 */
export async function forceFrameLength(page: Page, frameMs: number): Promise<void> {
  await page.evaluate(async (ms) => {
    const { game } = await import('/src/main.ts');
    const loop = game.loop;
    loop.raf.stop();
    loop.raf.start((time: number) => loop.step(time), true, ms);
  }, frameMs);
}

/** `console.error` and uncaught page errors, collected from now on. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Get past the front door (#121): wait for Intro and press Enter, which starts
 * a game with nothing highlighted. Every suite that used to land on
 * SpellSelect calls this after `goto` or `reload`, then waits for SpellSelect
 * as before.
 */
export async function startFromIntro(page: Page): Promise<void> {
  await waitForScene(page, SCENE.intro);
  await page.keyboard.press('Enter');
}

/** Every text object a scene is showing, in display order. */
export function sceneTexts(page: Page, key: string): Promise<string[]> {
  return page.evaluate(async (sceneKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene
      .getScene(sceneKey)
      .children.list.filter((child) => child.type === 'Text')
      .map((child) => (child as unknown as { text: string }).text);
  }, key);
}

/** One cue the game asked `Audio` for, as `recordSounds` logs it. */
export interface SoundRequest {
  key: SoundKey;
  /** Whether a sound started: the dedupe window, mute and a locked context all drop one. */
  started: boolean;
  atMs: number;
  /** `game.loop.frame` at the request, so cues from one step can be told apart. */
  frame: number;
}

/**
 * Log every cue the game asks for from here on (CO-159) by wrapping `play` on
 * the one `Audio` in the registry, which every scene shares. Idempotent.
 */
export async function recordSounds(page: Page): Promise<void> {
  await page.evaluate(async (registryKey) => {
    const { game } = await import('/src/main.ts');
    const audio = game.registry.get(registryKey) as Audio & { soundLog?: SoundRequest[] };
    if (audio.soundLog) return;
    const log: SoundRequest[] = [];
    audio.soundLog = log;
    const play = audio.play.bind(audio);
    audio.play = (key) => {
      const started = play(key);
      log.push({ key, started, atMs: performance.now(), frame: game.loop.frame });
      return started;
    };
  }, AUDIO_REGISTRY_KEY);
}

/** Everything `recordSounds` has logged so far, oldest first. */
export function readSounds(page: Page): Promise<SoundRequest[]> {
  return page.evaluate(async (registryKey) => {
    const { game } = await import('/src/main.ts');
    const audio = game.registry.get(registryKey) as Audio & { soundLog?: SoundRequest[] };
    return [...(audio.soundLog ?? [])];
  }, AUDIO_REGISTRY_KEY);
}

/**
 * The most starts of `key` that any one of its dedupe windows held. Windows
 * are measured 1 ms short, since the log's clock is read just after `Audio`'s.
 */
export function busiestWindow(log: readonly SoundRequest[], key: SoundKey): number {
  const starts = log.filter((r) => r.key === key && r.started).map((r) => r.atMs);
  const window = SOUNDS[key].minGapMs - 1;
  return Math.max(
    0,
    ...starts.map((at) => starts.filter((t) => t >= at && t - at < window).length),
  );
}
