import Phaser from 'phaser';
import { resolveSeed } from '../core/rng';
import { resolveTimeScale } from '../core/runState';
import { SCENE, SEED_REGISTRY_KEY, TIME_SCALE_REGISTRY_KEY } from '../core/scenePayloads';
import { validatePerks } from '../core/spellStats';
import { generatePlaceholderTextures } from '../render/textures';

/**
 * First scene: builds the placeholder textures every later scene draws with,
 * fixes the run seed, then hands off to SpellSelect.
 * `?debug=textures` opens the CO-005 texture check instead, `?debug=collisions`
 * the CO-032 overlap check.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot);
  }

  create(): void {
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
