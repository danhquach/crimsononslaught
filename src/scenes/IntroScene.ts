import Phaser from 'phaser';
import { MENU_ART } from '../config/menuArt';
import { emberPose, makeEmbers } from '../core/menuStyle';
import { createRng } from '../core/rng';
import { saveNotice } from '../core/save';
import { SAVE_RESET_REGISTRY_KEY, SCENE } from '../core/scenePayloads';
import { audioOf } from '../render/audio';
import { saveStoreFailed } from '../storage/localSave';
import { attachMenuInput } from './input';
import { TITLE_FONT, addHintLine, addMenuRow, drawMenuBackdrop } from './menuUi';

// The title image (letters 205 px tall in a 27 px margin) is centred here: its
// letters span y 17 to 222. Four entries (#226) stack 54 px apart from the first
// plate's centre, its top 21 px under the letters and the last plate ending 11 px
// above the save notice at `height - 72`.
const TITLE_Y = 120;
const MENU_TOP = 262;
const MENU_GAP = 54;
/** Where the lettering stands in for the title image when that did not load. */
const FALLBACK_TITLE_Y = 130;
const PLATE_WIDTH = 340;
const EMBER_COUNT = 24;
/** The embers' fixed seed: the same sparks every time, from no run's stream. */
const EMBER_SEED = 191;

/**
 * The front door (#121): the painted title and a four-entry menu on the painted arena
 * with embers drifting up (CO-191). Start Game goes to
 * SpellSelect, which starts the run exactly as it did when it was the first
 * screen — the seed is Boot's, read from the registry there. Settings,
 * Profile and Help (#226) are panels that come back here.
 *
 * Click, arrow keys and Enter, or a gamepad all drive the menu; Enter with
 * nothing highlighted starts a game. A save Boot had to reset is announced
 * here, once; a browser that will not keep the save (#316) is announced every
 * time this screen opens.
 */
export class IntroScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super(SCENE.intro);
  }

  create(): void {
    // The menu track carries across every menu screen (CO-157); asking again is a no-op.
    audioOf(this).playMusic('music.menu');
    this.leaving = false;
    const { width, height } = this.scale;

    drawMenuBackdrop(this, 'full');
    this.addEmbers();

    this.addTitle();

    const entries: readonly (readonly [label: string, scene: string])[] = [
      ['Start Game', SCENE.spellSelect],
      ['Settings', SCENE.settings],
      ['Profile', SCENE.profile],
      ['Help', SCENE.help],
    ];
    const items = entries.map(([label, scene], i) =>
      addMenuRow(this, {
        kind: 'plate',
        label,
        x: width / 2,
        y: MENU_TOP + i * MENU_GAP,
        width: PLATE_WIDTH,
        onConfirm: () => this.go(scene),
      }),
    );
    attachMenuInput(this, items, { keyboard: true, enterDefault: 0 });

    addHintLine(this);

    // The reset is said once: Boot leaves the flag up until this screen has
    // shown it. A failed write is said every time, while it holds.
    const reset = this.registry.get(SAVE_RESET_REGISTRY_KEY) === true;
    if (reset) this.registry.set(SAVE_RESET_REGISTRY_KEY, false);
    const notice = saveNotice(reset, saveStoreFailed());
    if (notice !== null) {
      this.add
        .text(width / 2, height - 72, notice, {
          fontFamily: 'Georgia, serif',
          fontSize: '16px',
          color: '#ff8a8a',
          backgroundColor: '#000000aa',
          padding: { x: 10, y: 4 },
        })
        .setOrigin(0.5);
    }
  }

  /** The painted title; lettering in the title face if the image did not load. */
  private addTitle(): void {
    const { width } = this.scale;
    if (this.textures.exists(MENU_ART.title.key)) {
      this.add.image(width / 2, TITLE_Y, MENU_ART.title.key);
      return;
    }
    // The blood-red glow is a dark stroke under a red shadow blur.
    this.add
      .text(width / 2, FALLBACK_TITLE_Y, 'Crimson Onslaught', {
        fontFamily: TITLE_FONT,
        fontSize: '92px',
        color: '#d92b40',
      })
      .setOrigin(0.5)
      .setStroke('#2a0407', 6)
      .setShadow(0, 0, '#ff2a2a', 16, true, true);
  }

  /**
   * Sparks drifting up behind the menu. Additive, so the art's black costs
   * nothing; each rides one looping tween the scene owns and drops when it stops.
   */
  private addEmbers(): void {
    if (!this.textures.exists(MENU_ART.ember.key)) return;
    const { width, height } = this.scale;
    for (const ember of makeEmbers(createRng(EMBER_SEED), EMBER_COUNT, width, height)) {
      const sprite = this.add
        .image(ember.x, ember.y, MENU_ART.ember.key, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ember.life * 1000,
        delay: ember.delay * 1000,
        repeat: -1,
        onUpdate: (tween) => {
          const pose = emberPose(ember, tween.getValue() ?? 0, MENU_ART.ember.frames);
          sprite
            .setPosition(pose.x, pose.y)
            .setAlpha(pose.alpha)
            .setFrame(pose.frame)
            .setScale(pose.scale);
        },
      });
    }
  }

  /** Idempotent: a click and a key press in the same frame leave exactly once. */
  private go(scene: string): void {
    if (this.leaving) return;
    this.leaving = true;
    audioOf(this).play('ui.confirm');
    this.scene.start(scene);
  }
}
