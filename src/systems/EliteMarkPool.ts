import Phaser from 'phaser';
import { ELITE_MARK, ELITE_MARK_DEPTH } from '../config/fx';
import { ATLAS_PAGES } from '../config/frames';
import { ELITE_SCHEDULE } from '../config/waves';
import { OverlayLedger } from '../core/overlayPool';
import type { Enemy } from '../entities/Enemy';
import { showEffect } from '../render/animate';

/**
 * The mark under every live elite (#126): a pool of plain sprites looping
 * `ELITE_MARK.clip` at their hosts' feet, positioned from the host every frame
 * and released when it dies or goes back to the pool.
 *
 * A sprite of its own rather than a tint or a scale on the elite: `flash` and
 * the status tints repaint the enemy every hit, and scaling it would resize
 * its Arcade body. The cap is the schedule's length, so every elite the run
 * can field is marked. With no atlas nothing is shown and the count stays 0.
 */
export class EliteMarkPool {
  private readonly group: Phaser.GameObjects.Group;
  private readonly ledger = new OverlayLedger<Enemy>(ELITE_SCHEDULE.length);
  private readonly sprites = new Map<Enemy, Phaser.GameObjects.Sprite>();

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: ELITE_SCHEDULE.length,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(ELITE_MARK_DEPTH),
    });
  }

  /** Marks out right now. */
  get count(): number {
    return this.ledger.count;
  }

  /** The clips the marks out are playing, sorted; a test hook. */
  get clips(): string[] {
    const keys = new Set<string>();
    for (const sprite of this.sprites.values()) {
      const key = sprite.anims.currentAnim?.key;
      if (key) keys.add(key);
    }
    return [...keys].sort();
  }

  /**
   * One frame: mark every elite in `enemies` — the live set — and follow each
   * host. Driven from `GameScene.simulate` after the bodies have settled.
   */
  update(enemies: readonly Enemy[]): void {
    const wanted = new Map<Enemy, string>();
    if (this.group.scene.anims.exists(ELITE_MARK.clip)) {
      for (const enemy of enemies) if (enemy.isElite) wanted.set(enemy, ELITE_MARK.clip);
    }
    const { acquired, released } = this.ledger.sync(wanted);
    for (const host of released) this.free(host);
    for (const [host, clip] of acquired) this.take(host, clip);
    for (const [host, sprite] of this.sprites) sprite.setPosition(host.x, host.y);
  }

  private take(host: Enemy, clip: string): void {
    const sprite = this.group.get(
      host.x,
      host.y,
      ATLAS_PAGES[0].key,
    ) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return;
    sprite.setActive(true).setVisible(true).setPosition(host.x, host.y).setScale(1);
    sprite.anims.stop();
    showEffect(sprite, clip);
    // Sized from the art's own width, so a re-cut sheet keeps the same span.
    const width = sprite.frame.width;
    if (width > 0) sprite.setScale((host.bodyRadius * 2 * ELITE_MARK.span) / width);
    this.sprites.set(host, sprite);
  }

  private free(host: Enemy): void {
    const sprite = this.sprites.get(host);
    if (!sprite) return;
    this.sprites.delete(host);
    sprite.anims.stop();
    this.group.killAndHide(sprite);
  }
}
