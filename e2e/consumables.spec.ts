import { expect, test, type Page } from '@playwright/test';
import {
  CHEST_EMBERS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  PICKUP_FLASH,
  type ConsumableKind,
} from '../src/config/pickups';
import { PLAYER_MAX_HP } from '../src/config/player';
import { SOUNDS } from '../src/config/sounds';
import { SPELL_IDS, type SpellId } from '../src/config/spells';
import { flashOn } from '../src/core/pickups';
import { SCENE } from '../src/core/scenePayloads';
import type { Pickup } from '../src/entities/Pickup';
import type { Player } from '../src/entities/Player';
import type { EnemyPool } from '../src/systems/EnemyPool';
import type { GemPool } from '../src/systems/GemPool';
import type { PickupPool } from '../src/systems/PickupPool';
import type { GameScene } from '../src/scenes/GameScene';
import type { HudScene } from '../src/scenes/HudScene';
import {
  busiestWindow,
  cardCenter,
  collectErrors,
  readSounds,
  recordSounds,
  startFromIntro,
  waitForScene,
  type SoundRequest,
} from './game';

/**
 * #128 in the browser: each consumable, dropped at the player's feet through
 * the pool by the `dropConsumable` test hook, is collected by the overlap and
 * does what it says. What drops and how often is `core/pickups.test.ts`'s; a
 * 0.3 % roll is no way to reach one here.
 *
 * Every run is invulnerable, so nothing but the test moves the player's HP.
 *
 * The bomb and the magnet stage what they act on — a crowd in view, gems far
 * off — in the same `evaluate` that drops them, rather than waiting for the run
 * to pile them up: how crowded the screen gets depends on the level-up offers,
 * and those differ between machines, so a wait for 15 enemies on screen held
 * locally and timed out at 12 on CI.
 */

const PICKED: SpellId = 'fire';
const SAMPLE_MS = 100;

type Report = GameScene['pickupReport'];
type FlashSample = GameScene['bombFlashReport'][number];

interface Sample {
  report: Report;
  hudHp: number;
  hudEmbers: number;
  elapsedMs: number;
}

async function startRun(page: Page, query: string): Promise<void> {
  await page.goto(`/?seed=1&invulnerable=1&${query}`);
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);
  await recordSounds(page);
}

/** How many times each of `keys` was asked for (CO-159). */
function counts(log: readonly SoundRequest[], keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((k) => [k, log.filter((r) => r.key === k).length]));
}

/** The run's report and the HUD in one `evaluate`, so they are the same instant. */
async function sample(page: Page): Promise<Sample> {
  return page.evaluate(async (scene) => {
    const { game } = await import('/src/main.ts');
    const report = (game.scene.getScene(scene.game) as GameScene).pickupReport;
    const hud = (game.scene.getScene(scene.hud) as HudScene).view;
    return { report, hudHp: hud.hp, hudEmbers: hud.embers, elapsedMs: hud.elapsedMs };
  }, SCENE);
}

/** What to set up in the arena, in the same instant, before a drop. */
interface Stage {
  /** HP taken straight off the player, round the invulnerability hook. */
  hurt?: number;
  /** Tanks placed on a grid inside the camera's view. */
  crowd?: number;
  /** Gems placed on a ring 400–1300 px out, far outside the pickup radius. */
  farGems?: number;
}

/**
 * Stage the arena, drop `kind` at the player's feet, and return the report
 * from the same instant, before the overlap can have taken it.
 */
async function drop(page: Page, kind: ConsumableKind, stage: Stage = {}): Promise<Report> {
  return page.evaluate(
    async ({ key, kind, stage }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      const inner = scene as unknown as { player: Player; enemies: EnemyPool; gems: GemPool };
      const { player } = inner;
      if (stage.hurt) player.takeDamage(stage.hurt);
      const view = scene.cameras.main.worldView;
      for (let i = 0; i < (stage.crowd ?? 0); i++) {
        // Six across, inset from the edges and clear of the player.
        const x = view.x + 120 + (i % 6) * ((view.width - 240) / 5);
        const y = view.y + 90 + (Math.floor(i / 6) % 4) * ((view.height - 180) / 3);
        if (Math.hypot(x - player.x, y - player.y) < 100) continue;
        inner.enemies.spawn('tank', x, y);
      }
      for (let i = 0; i < (stage.farGems ?? 0); i++) {
        const angle = (i / (stage.farGems ?? 1)) * Math.PI * 2;
        const r = 400 + (i % 10) * 100;
        inner.gems.spawn(player.x + Math.cos(angle) * r, player.y + Math.sin(angle) * r);
      }
      const report = scene.pickupReport;
      if (!scene.dropConsumable(kind)) throw new Error(`no room to drop ${kind}`);
      return report;
    },
    { key: SCENE.game, kind, stage },
  );
}

/** Wait until the run has picked up `count` consumables in all, answering level-ups on the way. */
async function waitForPickups(page: Page, count: number): Promise<Sample> {
  let last: Sample | null = null;
  await expect
    .poll(
      async () => {
        await answerLevelUp(page);
        last = await sample(page);
        return last.report.consumables;
      },
      { message: `${count} consumables picked up`, timeout: 10_000 },
    )
    .toBe(count);
  return last as unknown as Sample;
}

/** A level-up pauses the run under its overlay; the first card resumes it. */
async function answerLevelUp(page: Page): Promise<void> {
  const paused = await page.evaluate(async (levelUpKey) => {
    const { game } = await import('/src/main.ts');
    return game.scene.isActive(levelUpKey);
  }, SCENE.levelUp);
  if (paused) await page.keyboard.press('1');
}

test('a health pickup heals, capped at the maximum, and a chest pays Embers', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=1');

  const hurt = 50;
  const before = await drop(page, 'health', { hurt });
  expect(before.hp, 'HP after the test’s hit').toBe(PLAYER_MAX_HP - hurt);
  const healed = await waitForPickups(page, 1);
  expect(healed.report.hp).toBe(PLAYER_MAX_HP - hurt + HEAL_AMOUNT);
  expect(healed.hudHp, 'the HUD shows the healed HP').toBe(healed.report.hp);
  expect(healed.report.consumablesLive.health, 'the pickup left the floor').toBe(0);

  // A second one heals the rest of the way and stops at the maximum.
  await drop(page, 'health');
  const full = await waitForPickups(page, 2);
  expect(full.report.hp).toBe(PLAYER_MAX_HP);
  expect(full.hudHp).toBe(PLAYER_MAX_HP);

  // No elite drops one yet (#126), so a chest only comes from the hook.
  const beforeChest = await drop(page, 'chest');
  const paid = await waitForPickups(page, 3);
  // A crowd kill at the player's feet may bank an Ember in the same window.
  expect(paid.report.embers - beforeChest.embers).toBeGreaterThanOrEqual(CHEST_EMBERS);
  expect(paid.report.embers - beforeChest.embers).toBeLessThan(CHEST_EMBERS + 10);
  expect(paid.hudEmbers).toBe(paid.report.embers);

  // CO-159: each pickup asked for its own cue.
  const sounds = counts(await readSounds(page), ['pickup.health', 'pickup.chest']);
  expect(sounds).toEqual({ 'pickup.health': 2, 'pickup.chest': 1 });
  expect(errors).toEqual([]);
});

test('a bomb on the floor blinks white and keeps its place and hitbox', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=1');
  const rule = PICKUP_FLASH.bomb;
  if (!rule) throw new Error('the bomb has no flash rule');

  // 250 px off is well outside the pickup radius, so it lies there for the whole window.
  // A kill may drop a bomb of its own, so the test follows the one it placed: the
  // bomb that was not on the floor before, found by where it lies.
  const placed = await page.evaluate(
    async ({ key }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      const before = scene.bombFlashReport;
      if (!scene.dropConsumable('bomb', 250)) return null;
      return (
        scene.bombFlashReport.find((b) => !before.some((o) => o.x === b.x && o.y === b.y)) ?? null
      );
    },
    { key: SCENE.game },
  );
  if (!placed) throw new Error('the bomb was not placed');

  // Sampled in the page on every frame, so age, flag, tint and position are the same
  // instant. A fixed wait between evaluates aliased with the 900 ms blink on CI (#355):
  // evaluates ~450 ms apart never landed in the 140 ms lit window. Each evaluate samples
  // for a second, then any level-up is answered. Sampling goes on until both states are seen.
  const trace: FlashSample[] = [];
  const until = Date.now() + 15_000;
  const seen = () => ({
    on: trace.filter((s) => s.flashing).length,
    off: trace.filter((s) => !s.flashing).length,
  });
  while (Date.now() < until && (trace.length < 40 || seen().on === 0 || seen().off === 0)) {
    await answerLevelUp(page);
    const chunk = await page.evaluate(
      async ({ key, at }) => {
        const { game } = await import('/src/main.ts');
        const scene = game.scene.getScene(key) as GameScene;
        const samples: (FlashSample | null)[] = [];
        const take = () =>
          samples.push(scene.bombFlashReport.find((b) => b.x === at.x && b.y === at.y) ?? null);
        scene.events.on('postupdate', take);
        await new Promise((done) => setTimeout(done, 1_000));
        scene.events.off('postupdate', take);
        return samples;
      },
      { key: SCENE.game, at: { x: placed.x, y: placed.y } },
    );
    for (const bomb of chunk) {
      expect(bomb, 'the placed bomb still lies where it landed').not.toBeNull();
      trace.push(bomb as FlashSample);
    }
  }
  console.log(`bomb flash: ${trace.length} samples, ${seen().on} on, ${seen().off} off`);

  expect(seen().on, 'samples while flashing').toBeGreaterThan(0);
  expect(seen().off, 'samples while not flashing').toBeGreaterThan(0);
  const first = trace[0] as FlashSample;
  for (const [i, s] of trace.entries()) {
    expect(s.flashing, `flashing follows the rule at ${s.ageMs} ms (sample ${i})`).toBe(
      flashOn(s.ageMs, rule),
    );
    expect(s.tinted, `the sprite is tint-filled exactly while flashing (sample ${i})`).toBe(
      s.flashing,
    );
    // No scale or alpha pulse: the hitbox and the place it lies stay put.
    expect(s.bodyRadius, `hitbox radius ${i}`).toBe(first.bodyRadius);
    expect([s.x, s.y], `position ${i}`).toEqual([first.x, first.y]);
    // Two frames can read the same age (a level-up pause, or a frame with no sim step).
    if (i > 0)
      expect(s.ageMs, `age never falls ${i}`).toBeGreaterThanOrEqual(
        (trace[i - 1] as FlashSample).ageMs,
      );
  }
  expect((trace.at(-1) as FlashSample).ageMs, 'age rises over the window').toBeGreaterThan(
    first.ageMs,
  );

  // Taken mid-blink, it bursts in its own colours, and nothing leaves the pool still white.
  // The bomb's own `collect` is wrapped to record, at the moment it is taken, whether it
  // was lit and whether the tint survived. The player is put on it at the start of a lit
  // window, so it is still lit a frame or two later when the overlap takes it, and a
  // level-up pausing the run in between only freezes that state.
  let touched = false;
  const touchUntil = Date.now() + 15_000;
  while (!touched && Date.now() < touchUntil) {
    await answerLevelUp(page);
    touched = await page.evaluate(
      async ({ key, at, periodMs }) => {
        const { game } = await import('/src/main.ts');
        const scene = game.scene.getScene(key) as GameScene;
        const { player, pickups } = scene as unknown as { player: Player; pickups: PickupPool };
        const bomb = (pickups.group.getChildren() as Pickup[]).find(
          (p) => p.active && !p.isCollected && p.x === at.x && p.y === at.y,
        );
        if (!bomb) throw new Error('the placed bomb left the floor untouched');
        const frame = () =>
          new Promise<void>((done) => {
            const finish = () => {
              clearTimeout(timer);
              done();
            };
            const timer = setTimeout(() => {
              scene.events.off('postupdate', finish);
              done();
            }, 50);
            scene.events.once('postupdate', finish);
          });
        const litEarly = () => bomb.flashState.flashing && bomb.flashState.ageMs % periodMs < 40;
        for (let i = 0; i < 90 && !litEarly(); i++) await frame();
        if (!litEarly()) return false;
        const record = window as unknown as { bombTaken?: { lit: boolean; tinted: boolean } };
        const collect = bomb.collect.bind(bomb);
        bomb.collect = () => {
          const lit = bomb.flashState.flashing;
          collect();
          record.bombTaken = { lit, tinted: bomb.flashState.tinted };
          // Back to the class's own method before the pool hands the sprite out again.
          delete (bomb as unknown as { collect?: unknown }).collect;
        };
        (player.body as unknown as { reset(x: number, y: number): void }).reset(at.x, at.y);
        return true;
      },
      { key: SCENE.game, at: { x: placed.x, y: placed.y }, periodMs: rule.periodMs },
    );
  }
  expect(touched, 'the player was put on the lit bomb').toBe(true);

  let taken: { lit: boolean; tinted: boolean } | undefined;
  const takeUntil = Date.now() + 15_000;
  while (!taken && Date.now() < takeUntil) {
    await answerLevelUp(page);
    taken = await page.evaluate(
      () => (window as unknown as { bombTaken?: { lit: boolean; tinted: boolean } }).bombTaken,
    );
    if (!taken) await page.waitForTimeout(SAMPLE_MS);
  }
  console.log(`bomb taken: ${JSON.stringify(taken)}`);
  expect(taken, 'the player took the placed bomb').toBeDefined();
  expect(taken?.lit, 'it was lit the moment it was taken').toBe(true);
  expect(taken?.tinted, 'a taken bomb bursts untinted').toBe(false);

  // Once the burst is over the pooled sprite is free; a pickup dropped after it is not white.
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ key, at }) => {
            const { game } = await import('/src/main.ts');
            const { pickups } = game.scene.getScene(key) as unknown as { pickups: PickupPool };
            return (pickups.group.getChildren() as Pickup[]).some(
              (p) => p.active && p.x === at.x && p.y === at.y,
            );
          },
          { key: SCENE.game, at: { x: placed.x, y: placed.y } },
        ),
      { message: 'the taken bomb went back to the pool', timeout: 5_000 },
    )
    .toBe(false);
  const whiteAfter = await page.evaluate(
    async ({ key }) => {
      const { game } = await import('/src/main.ts');
      const scene = game.scene.getScene(key) as GameScene;
      if (!scene.dropConsumable('health', 250)) throw new Error('no room to drop health');
      const { pickups } = scene as unknown as { pickups: PickupPool };
      return (pickups.group.getChildren() as Pickup[])
        .filter((p) => p.active && !(p.kind === 'consumable' && p.consumableKind === 'bomb'))
        .filter((p) => p.flashState.tinted).length;
    },
    { key: SCENE.game },
  );
  expect(whiteAfter, 'pickups tinted white that have no blink').toBe(0);
  expect(errors).toEqual([]);
});

test('a magnet pulls in the gems lying round the arena', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=4');
  const before = await drop(page, 'magnet', { farGems: 40 });
  expect(before.gems, 'gems lying far off at the drop').toBeGreaterThanOrEqual(40);
  await waitForPickups(page, 1);
  const trace: Sample[] = [];
  // 11 s of run time; a runner drawing 10 fps covers it in well under 30 s.
  const until = Date.now() + 30_000;
  let magnetSeen = false;
  while (Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    trace.push(current);
    if (current.report.magnetMsLeft > 0) magnetSeen = true;
    if (magnetSeen && current.report.magnetMsLeft === 0) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  const live = trace.filter((t) => t.report.magnetMsLeft > 0);
  expect(live.length, 'samples while the magnet ran').toBeGreaterThan(0);
  expect(Math.max(...live.map((t) => t.report.magnetMsLeft))).toBeLessThanOrEqual(
    MAGNET_DURATION_MS,
  );
  // Gems still drop while it runs, but they no longer lie there: the floor
  // empties to what is in flight.
  const fewest = Math.min(...live.map((t) => t.report.gems));
  expect(fewest, `gems left of ${before.gems}`).toBeLessThanOrEqual(before.gems / 4);
  expect(trace[trace.length - 1]?.report.magnetMsLeft, 'the magnet ran out').toBe(0);

  // CO-159: the grab and the pull each ask once; the gems it pulls in ask one
  // each, and the dedupe window keeps what starts to its cap.
  const log = await readSounds(page);
  expect(counts(log, ['pickup.magnet', 'pickup.magnetPull'])).toEqual({
    'pickup.magnet': 1,
    'pickup.magnetPull': 1,
  });
  const gemCues = log.filter((r) => r.key === 'progress.gem');
  expect(gemCues.length, 'gem cues asked for').toBeGreaterThan(0);
  expect(busiestWindow(log, 'progress.gem'), 'gem starts in one window').toBeLessThanOrEqual(
    SOUNDS['progress.gem'].maxConcurrent,
  );
  expect(errors).toEqual([]);
});

test('a bomb kills every regular enemy on screen', async ({ page }) => {
  const errors = collectErrors(page);
  await startRun(page, 'timeScale=1');
  const before = await drop(page, 'bomb', { crowd: 24 });
  expect(before.onScreen, 'enemies on screen at the drop').toBeGreaterThanOrEqual(15);
  const after = await waitForPickups(page, 1);
  // The bomb lands a step after the drop; spells kill on top of it, and an
  // enemy may walk off the edge in that step, so allow a little either way.
  expect(after.report.kills - before.kills).toBeGreaterThanOrEqual(before.onScreen - 2);
  expect(after.report.onScreen, 'the screen after the blast').toBeLessThan(before.onScreen / 2);

  // CO-159: one grab and one blast, however many enemies the blast hit.
  const log = await readSounds(page);
  expect(counts(log, ['pickup.bomb', 'pickup.bombBlast'])).toEqual({
    'pickup.bomb': 1,
    'pickup.bombBlast': 1,
  });
  expect(errors).toEqual([]);
});
