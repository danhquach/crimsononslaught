import { expect, test } from '@playwright/test';
import { SOUND_KEYS } from '../src/config/sounds';
import { AUDIO_REGISTRY_KEY, SCENE } from '../src/core/scenePayloads';
import type { Audio } from '../src/render/audio';
import { SAVE_STORAGE_KEY } from '../src/storage/localSave';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * Sound (CO-102): every clip loads with the rest of the assets, a cue plays
 * once the first click has unlocked the browser's audio, `M` mutes everything
 * and the mute survives a reload. The console stays clean throughout — a 404
 * on a clip would be a `console.error`.
 */
test('loads every clip, plays after the first click, and M mutes across a reload', async ({
  page,
}) => {
  const errors = collectErrors(page);

  await page.goto('/?seed=1');
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);

  const missing = await page.evaluate(async (keys) => {
    const { game } = await import('/src/main.ts');
    return keys.filter((key) => !game.cache.audio.exists(key));
  }, SOUND_KEYS);
  expect(missing).toEqual([]);

  const { x, y } = cardCenter(0);
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  // The click above is the unlocking gesture. The browser resumes its audio
  // context a moment after the click, so the first cue is polled for rather
  // than asked for once: cues asked for in that moment are dropped by design.
  await expect
    .poll(
      () =>
        page.evaluate(async (registryKey) => {
          const { game } = await import('/src/main.ts');
          const audio = game.registry.get(registryKey) as Audio;
          return { muted: audio.settings.muted, started: audio.play('ui.move') };
        }, AUDIO_REGISTRY_KEY),
      { message: 'a cue starts once audio is unlocked', timeout: 5_000 },
    )
    .toEqual({ muted: false, started: true });

  await page.keyboard.press('m');
  const stored = await page.evaluate((key) => localStorage.getItem(key), SAVE_STORAGE_KEY);
  expect(stored).not.toBeNull();
  expect((JSON.parse(stored as string) as { settings: Record<string, unknown> }).settings).toEqual(
    expect.objectContaining({ 'audio.muted': true }),
  );

  await page.reload();
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const afterReload = await page.evaluate(async (registryKey) => {
    const { game } = await import('/src/main.ts');
    const audio = game.registry.get(registryKey) as Audio;
    return { muted: audio.settings.muted, started: audio.play('ui.move') };
  }, AUDIO_REGISTRY_KEY);
  expect(afterReload).toEqual({ muted: true, started: false });

  expect(errors).toEqual([]);
});
