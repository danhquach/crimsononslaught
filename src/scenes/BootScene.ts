import Phaser from 'phaser';
import { resolveSeed } from '../core/rng';
import { resolveInvulnerable, resolveTimeScale } from '../core/runState';
import {
  INVULNERABLE_REGISTRY_KEY,
  SCENE,
  SEED_REGISTRY_KEY,
  TIME_SCALE_REGISTRY_KEY,
} from '../core/scenePayloads';
import { validatePerks } from '../core/spellStats';
import { installAtlas, queueAtlas } from '../render/atlas';
import { generatePlaceholderTextures } from '../render/textures';

/**
 * First scene: loads the sprite atlas, fills any gap with a placeholder
 * texture, fixes the run seed, then hands off to SpellSelect.
 * `?debug=textures` opens the CO-005 texture check instead, `?debug=collisions`
 * the CO-032 overlap check.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot);
  }

  preload(): void {
    queueAtlas(this);
  }

  create(): void {
    // Art first, placeholders second: `generatePlaceholderTextures` leaves any
    // key the atlas already provides alone, so a key only falls back to a
    // generated shape when the atlas has nothing for it (spec §6, CO-080).
    installAtlas(this);
    generatePlaceholderTextures(this);

    // Spec §7: config is checked once at boot and complains loudly, but a bad
    // perk tree never stops the run — the nodes that are sound still work.
    for (const problem of validatePerks()) console.error(`[config] ${problem}`);

    // Run seed: `?seed=<int>` reproduces a run; otherwise a fresh one per page
    // load. Logged so a bug report can quote it. SpellSelect reads it from the
    // registry and passes it into Game with the chosen spell.
    const seed = resolveSeed(location.search, Date.now());
    this.registry.set(SEED_REGISTRY_KEY, seed);
    console.info(`[rng] seed=${seed}`);

    // `?timeScale=<n>` speeds the run clock up (CO-030); Game reads it from the
    // registry. Logged only when it is on, so a normal run stays quiet.
    const timeScale = resolveTimeScale(location.search);
    this.registry.set(TIME_SCALE_REGISTRY_KEY, timeScale);
    if (timeScale !== 1) console.info(`[run] timeScale=${timeScale}`);

    // `?invulnerable=1` lets a hands-off browser run reach the boss (CO-061).
    const invulnerable = resolveInvulnerable(location.search);
    this.registry.set(INVULNERABLE_REGISTRY_KEY, invulnerable);
    if (invulnerable) console.info('[run] invulnerable=1');

    const debug = new URLSearchParams(location.search).get('debug');
    if (debug === 'textures') {
      this.scene.start(SCENE.textureDebug);
      return;
    }
    if (debug === 'collisions') {
      this.scene.start(SCENE.collisionDebug);
      return;
    }

    this.scene.start(SCENE.spellSelect);
  }
}
