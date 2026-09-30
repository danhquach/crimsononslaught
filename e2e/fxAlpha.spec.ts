import { expect, test, type Page } from '@playwright/test';
import { FX_ALPHA } from '../src/config/fx';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { SCENE } from '../src/core/scenePayloads';
import type { GameScene } from '../src/scenes/GameScene';
import { cardCenter, collectErrors, startFromIntro, waitForScene } from './game';

/**
 * #347 in the browser: the clips in `FX_ALPHA` are drawn see-through, so the
 * crowd, shots and pickups read through a burst, and a clip not listed is not.
 *
 * `core/fx.test.ts` covers the table lookup. What only a real run can show is
 * that each draw site applies it: the burst pool (and resets a recycled
 * sprite), the falling meteor, the sword on its ring and the flame front.
 *
 * No frame-rate floor and no sample-count floor: each check reads the alpha of
 * the sprites a sample found, and the run is left as soon as every kind has
 * been seen at least once.
 */

const PICKED: SpellId = 'fire';
const EXTRA = ['fire_meteor', 'fire_column', 'lightning_sword'] as const;
/** Run time the window starts at, in seconds: a crowd is already walking in. */
const START_AT_S = 60;
/** A runner too slow to see all three in this much wall clock fails outright. */
const WALL_CAP_MS = 40_000;
const SAMPLE_MS = 100;
const EPSILON = 1e-6;

/** What the table lists for `clip`; NaN for a clip it does not, which no alpha matches. */
function listed(clip: string): number {
  return FX_ALPHA[clip] ?? Number.NaN;
}

/** The clips `FxPool` draws that the table lists. */
const POOLED_CLIPS = ['fire.explode', 'ice.nova', 'ice.shatter', 'ice.spikeRing'] as const;
/** A clip the table leaves out, to burst after a listed one on the same pooled sprite. */
const UNLISTED_CLIP = 'earth.impact';

async function startRun(page: Page, query: string): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
}

test('the burst pool draws a listed clip see-through and resets a recycled sprite', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=1');

  // One synchronous evaluate: no step of the game runs between the bursts and
  // the reads, so nothing finishes a clip or takes a sprite out from under it.
  const read = await page.evaluate(
    async ({ scene, clips, unlisted }) => {
      const { game } = await import('/src/main.ts');
      type Burst = { burst: (clip: string, x: number, y: number) => boolean };
      type Sprite = Phaser.GameObjects.Sprite;
      const gameScene = game.scene.getScene(scene.game) as unknown as {
        fx: Burst & { group: Phaser.GameObjects.Group };
      };
      const { fx } = gameScene;
      // Nothing playing, so the first inactive sprite is the one a burst takes.
      for (const child of fx.group.getChildren()) fx.group.killAndHide(child);

      const at = (clip: string, index: number) => {
        const x = -5000 - index * 100;
        const shown = fx.burst(clip, x, -5000);
        const sprite = (fx.group.getChildren() as Sprite[]).find(
          (child) => child.active && child.x === x && child.anims.currentAnim?.key === clip,
        );
        return { shown, sprite };
      };

      const listed = clips.map((clip, i) => {
        const { shown, sprite } = at(clip, i);
        return { clip, shown, alpha: sprite?.alpha ?? null };
      });

      // Recycle: the same pooled sprite, first a listed clip, then an unlisted one.
      for (const child of fx.group.getChildren()) fx.group.killAndHide(child);
      const first = at('ice.nova', 10);
      const firstAlpha = first.sprite?.alpha ?? null;
      if (first.sprite) fx.group.killAndHide(first.sprite);
      const second = at(unlisted, 11);
      return {
        listed,
        firstAlpha,
        reused: first.sprite !== undefined && first.sprite === second.sprite,
        unlistedShown: second.shown,
        unlistedAlpha: second.sprite?.alpha ?? null,
      };
    },
    { scene: SCENE, clips: [...POOLED_CLIPS], unlisted: UNLISTED_CLIP },
  );

  for (const { clip, shown, alpha } of read.listed) {
    expect(shown, `${clip} shown`).toBe(true);
    expect(alpha, `${clip} alpha`).toBeCloseTo(listed(clip), 5);
  }
  expect(read.firstAlpha, 'nova alpha').toBeCloseTo(listed('ice.nova'), 5);
  expect(read.unlistedShown, 'unlisted clip shown').toBe(true);
  expect(read.reused, 'the same pooled sprite took the next burst').toBe(true);
  expect(read.unlistedAlpha, 'unlisted clip after a listed one on the same sprite').toBe(1);
  expect(errors).toEqual([]);
});

/** What the in-page listener has collected: every alpha on screen for each kind of drawn clip. */
interface Seen {
  meteors: number[];
  swords: number[];
  waves: number[];
}

/** Each array stops taking entries at this many, so a long wait cannot grow it without bound. */
const COLLECT_CAP = 200;

/**
 * Listen on the game scene's `postupdate`, so every frame the game steps is
 * read: a meteor is in the air for a fraction of a second at `?timeScale=10`,
 * which a poll from the test can miss on a slow runner.
 */
async function startCollecting(page: Page): Promise<void> {
  await page.evaluate(
    async ({ scene, cap }) => {
      const { game } = await import('/src/main.ts');
      const gameScene = game.scene.getScene(scene.game) as GameScene;
      const seen: Seen = { meteors: [], swords: [], waves: [] };
      const playing = (clip: string) =>
        gameScene.children.list
          .filter((child): child is Phaser.GameObjects.Sprite => 'anims' in child)
          .filter((sprite) => sprite.active && sprite.anims.currentAnim?.key === clip)
          .map((sprite) => sprite.alpha);
      const take = (into: number[], alphas: number[]) => {
        for (const alpha of alphas) if (into.length < cap) into.push(alpha);
      };
      const listener = () => {
        take(
          seen.meteors,
          gameScene.strikeReport.live.map((view) => view.alpha),
        );
        take(seen.swords, playing('lightning.sword'));
        take(seen.waves, playing('fire.wave'));
      };
      gameScene.events.on('postupdate', listener);
      const hook = window as unknown as Record<string, unknown>;
      hook.__fxAlphaSeen = seen;
      hook.__fxAlphaStop = () => gameScene.events.off('postupdate', listener);
    },
    { scene: SCENE, cap: COLLECT_CAP },
  );
}

/** What the listener has collected so far (a copy). */
function readCollected(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const seen = (window as unknown as { __fxAlphaSeen: Seen }).__fxAlphaSeen;
    return { meteors: [...seen.meteors], swords: [...seen.swords], waves: [...seen.waves] };
  });
}

async function stopCollecting(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, () => void>).__fxAlphaStop?.();
  });
}

/** A level-up pauses the run under its overlay; the first card resumes it. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('the falling meteor, the sword and the flame front are drawn see-through', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await startRun(page, `timeScale=10&startAt=${START_AT_S}&loadout=${EXTRA.join(',')}`);

  await startCollecting(page);
  let seen = await readCollected(page);
  const until = Date.now() + WALL_CAP_MS;
  while (
    Date.now() < until &&
    (seen.meteors.length === 0 || seen.swords.length === 0 || seen.waves.length === 0)
  ) {
    await answerLevelUp(page);
    await page.waitForTimeout(SAMPLE_MS);
    seen = await readCollected(page);
  }
  await stopCollecting(page);
  console.log(
    `fxAlpha: meteors ${seen.meteors.length}, swords ${seen.swords.length}, waves ${seen.waves.length}, ` +
      `widest wave alpha ${Math.max(0, ...seen.waves)}`,
  );

  expect(seen.meteors.length, 'a meteor was seen in the air').toBeGreaterThan(0);
  for (const alpha of seen.meteors) expect(alpha).toBeCloseTo(listed('fire.meteor'), 5);

  expect(seen.swords.length, 'a sword was seen on its ring').toBeGreaterThan(0);
  for (const alpha of seen.swords) expect(alpha).toBeCloseTo(listed('lightning.sword'), 5);

  // The front fades out over the end of its range, so it is at or under the
  // listed alpha, never over.
  expect(seen.waves.length, 'a flame front was seen').toBeGreaterThan(0);
  for (const alpha of seen.waves) {
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThanOrEqual(listed('fire.wave') + EPSILON);
  }
  // The first frame a front is drawn is at full fade, so some sample is at the
  // listed alpha itself; half of it leaves room for the rounding.
  expect(Math.max(...seen.waves), 'a flame front was drawn').toBeGreaterThanOrEqual(
    listed('fire.wave') * 0.5,
  );
  expect(errors).toEqual([]);
});
