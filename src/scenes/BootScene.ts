import Phaser from 'phaser';
import { resolveSeed } from '../core/rng';
import { resolveInvulnerable, resolveLoadout, resolveTimeScale } from '../core/runState';
import {
  INVULNERABLE_REGISTRY_KEY,
  LOADOUT_REGISTRY_KEY,
  SAVE_REGISTRY_KEY,
  SAVE_RESET_REGISTRY_KEY,
  SCENE,
  SEED_REGISTRY_KEY,
  TIME_SCALE_REGISTRY_KEY,
} from '../core/scenePayloads';
import { validateLoadoutConfig } from '../core/loadout';
import { parseSave, serializeSave } from '../core/save';
import { validateMeta } from '../core/upgrades';
import { loadSaveJson, storeSaveJson } from '../storage/localSave';
import { installAtlas, queueAtlas, warnIfAtlasMissing } from '../render/atlas';
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
    warnIfAtlasMissing(this);
    installAtlas(this);
    generatePlaceholderTextures(this);

    // Spec §7: config is checked once at boot and complains loudly, but a bad
    // roster or passive list never stops the run — everything sound still works.
    for (const problem of validateLoadoutConfig()) console.error(`[config] ${problem}`);
    for (const problem of validateMeta()) console.error(`[config] ${problem}`);

    // Saved progress (CO-101): parsed once here, then lives in the registry.
    // A save this build cannot read is reset and overwritten rather than left
    // to fail the same way on every boot; the player is told on SpellSelect.
    const parsed = parseSave(loadSaveJson());
    if (parsed.status === 'reset') {
      console.warn(`[save] stored save was unreadable (${parsed.reason}); starting fresh`);
      storeSaveJson(serializeSave(parsed.save));
    }
    this.registry.set(SAVE_REGISTRY_KEY, parsed.save);
    this.registry.set(SAVE_RESET_REGISTRY_KEY, parsed.status === 'reset');

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

    // `?loadout=fire,ice` casts several actives in one run (CO-109), until the
    // level-up rework (#132) can offer them.
    const loadout = resolveLoadout(location.search);
    this.registry.set(LOADOUT_REGISTRY_KEY, loadout);
    if (loadout.length > 0) console.info(`[run] loadout=${loadout.join(',')}`);

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
