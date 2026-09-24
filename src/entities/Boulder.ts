import Phaser from 'phaser';
import { PLACEHOLDERS, type TextureKey } from '../config/colors';
import { ART_BOXES, type ArtBox } from '../config/frames';
import { spinTimeScale } from '../core/fx';
import { clearClip, showClip } from '../render/animate';

/** The clip a boulder plays on the ring (CO-082). */
const SPIN_CLIP = 'earth.spin';

/**
 * What a body on the ring is drawn as: a placeholder texture and, when the
 * atlas carries it, the clip it plays. Earth's boulders are the default; a
 * Lightning Sword (#142) rides the same ring wearing its own clip.
 */
export interface BodyLook {
  readonly texture: TextureKey;
  readonly clip?: string;
}

export const BOULDER_LOOK: BodyLook = { texture: 'boulder', clip: SPIN_CLIP };

/**
 * One body on the ring (spec §5 "Earth — Orbiting Boulders"). It has no motion
 * of its own: `spells/OrbitingBodySpell.ts` and `spells/EarthShieldSpell.ts`
 * place it every frame from the orbit maths in `core/orbitingBoulders.ts`, and
 * Arcade reads the new position on its next step, so the body is where the
 * sprite is drawn.
 *
 * Pooled — never constructed per perk. The spell owns the pool and calls
 * `spawn` / `despawn`; an inactive boulder has its body disabled, so it costs
 * nothing until the count perk brings it back.
 *
 * It plays `earth.spin` at a rate that follows the orbit speed (CO-082). The
 * drawn disc — the clip's art, or the placeholder — is scaled to `size`, and
 * Arcade scales the body with it, so the hitbox is the disc either way.
 */
export class Boulder extends Phaser.Physics.Arcade.Sprite {
  private radius = 0;
  /** Unscaled width of what is drawn: the spin clip's art, or the placeholder disc. */
  private drawnWidth = PLACEHOLDERS.boulder.width;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y, 'boulder');
  }

  /**
   * Take this pooled object out of the pool at (x, y) as a body of `size` px
   * radius wearing `look` — a boulder unless told otherwise.
   */
  spawn(x: number, y: number, size: number, look: BodyLook = BOULDER_LOOK): void {
    clearClip(this);
    this.setTexture(look.texture);
    this.setOrigin(0.5, 0.5);
    this.setRotation(0);
    this.enableBody(true, x, y, true, true);
    // The body is a circle filling the unscaled disc; `resize` scales the
    // sprite, and Arcade scales the body with it, so the hitbox stays the disc
    // whatever size this pooled body was last time. `showClip` re-centres the
    // same circle on the clip's anchor when the atlas carries it. The disc is
    // the clip's art, not its frame, so a transparent margin round the frame
    // neither shrinks the stone on screen nor leaves its hitbox wider than the
    // stone (CO-126). The circle stays on the anchor rather than the art's
    // centre: the anchor is the sprite's position, which is where the orbit
    // maths puts the body, and the two sit within half a pixel.
    const art = look.clip
      ? (ART_BOXES as Readonly<Record<string, ArtBox | undefined>>)[look.clip]
      : undefined;
    const shown = look.clip && art ? showClip(this, look.clip, art.w / 2) : false;
    this.drawnWidth = shown && art ? art.w : PLACEHOLDERS[look.texture].width;
    if (!shown) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      // Centred on the sprite, so a bar as wide as it is short still hits as a
      // disc of half its width around its middle.
      const placeholder = PLACEHOLDERS[look.texture];
      body.setCircle(this.drawnWidth / 2, 0, (placeholder.height - this.drawnWidth) / 2);
    }
    this.radius = 0;
    this.resize(size);
  }

  /** Return to the pool: inactive, invisible, body disabled. */
  despawn(): void {
    this.disableBody(true, true);
  }

  /**
   * Match the drawn disc — and with it the body — to `size` px radius (spec
   * §5: the Boulder Growth perk grows both). A no-op when nothing changed, so
   * it is cheap to call per frame.
   */
  resize(size: number): void {
    if (size === this.radius) return;
    this.radius = size;
    this.setScale((size * 2) / this.drawnWidth);
  }

  /** Roll at a rate proportional to `orbitSpeed` (CO-082); cheap to call per frame. */
  spin(orbitSpeed: number): void {
    this.anims.timeScale = spinTimeScale(orbitSpeed);
  }
}
