import Phaser from 'phaser';
import { resolveSeed } from '../core/rng';
import { resolveTimeScale } from '../core/runState';
import { SCENE, SEED_REGISTRY_KEY, TIME_SCALE_REGISTRY_KEY } from '../core/scenePayloads';
import { generatePlaceholderTextures } from '../render/textures';

/**
 * First scene: builds the placeholder textures every later scene draws with,
 * fixes the run seed, then hands off to SpellSelect.
 * `?debug=textures` opens the CO-005 texture check instead.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot);
  }

  create(): void {
    generatePlaceholderTextures(this);

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

    if (new URLSearchParams(location.search).get('debug') === 'textures') {
      this.scene.start(SCENE.textureDebug);
      return;
    }

    this.scene.start(SCENE.spellSelect);
  }
}
