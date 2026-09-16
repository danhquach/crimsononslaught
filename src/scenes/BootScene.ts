import Phaser from 'phaser';
import { resolveSeed } from '../core/rng';
import { SCENE, SEED_REGISTRY_KEY } from '../core/scenePayloads';
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

    if (new URLSearchParams(location.search).get('debug') === 'textures') {
      this.scene.start(SCENE.textureDebug);
      return;
    }

    this.scene.start(SCENE.spellSelect);
  }
}
