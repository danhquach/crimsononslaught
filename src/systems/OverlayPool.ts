import Phaser from 'phaser';
import { FX_DEPTH, MAX_LIVE_OVERLAYS } from '../config/fx';
import { ATLAS_KEY } from '../config/frames';
import { statusOverlay } from '../core/fx';
import { OverlayLedger } from '../core/overlayPool';
import type { Enemy } from '../entities/Enemy';
import { showEffect } from '../render/animate';

/**
 * Status overlays (CO-082): the flame on a burning enemy, the frost on a
 * slowed one, the block around a frozen one, the sparks over a stunned one.
 * A pool of plain sprites, one per afflicted enemy, positioned from its host
 * every frame and released when the status ends or the host leaves the live
 * set — dies, or goes back to the pool.
 *
 * Which enemy shows what is `core/fx.ts`'s call and the bookkeeping is
 * `core/overlayPool.ts`'s; this class only moves sprites. The cap is the
 * enemy pool's, so the overlays can never outnumber the crowd. With no atlas
 * nothing is shown and the count stays 0.
 */
export class OverlayPool {
  private readonly group: Phaser.GameObjects.Group;
  private readonly ledger = new OverlayLedger<Enemy>(MAX_LIVE_OVERLAYS);
  private readonly sprites = new Map<Enemy, Phaser.GameObjects.Sprite>();

  constructor(scene: Phaser.Scene) {
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_OVERLAYS,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(FX_DEPTH),
    });
  }

  /** Overlays out right now; the test hook the acceptance criteria name. */
  get count(): number {
    return this.ledger.count;
  }

  /**
   * One frame: reconcile against `enemies` — the live set — and follow each
   * host. Driven from `GameScene.simulate`, after the enemies have moved, so
   * an overlay sits on where its host is drawn this frame.
   */
  update(enemies: readonly Enemy[]): void {
    const wanted = new Map<Enemy, string>();
    for (const enemy of enemies) {
      const clip = statusOverlay({
        burning: enemy.isBurning,
        slowed: enemy.slowed,
        frozen: enemy.isFrozen,
        stunned: enemy.isStunned,
        staggered: enemy.isStaggered,
        bleeding: enemy.isBleeding,
        radius: enemy.bodyRadius,
      });
      if (clip && this.group.scene.anims.exists(clip)) wanted.set(enemy, clip);
    }
    const { acquired, released } = this.ledger.sync(wanted);
    for (const host of released) this.free(host);
    for (const [host, clip] of acquired) this.take(host, clip);
    for (const [host, sprite] of this.sprites) sprite.setPosition(host.x, host.y);
  }

  private take(host: Enemy, clip: string): void {
    const sprite = this.group.get(host.x, host.y, ATLAS_KEY) as Phaser.GameObjects.Sprite | null;
    // The ledger and the group share a cap, so a slot the ledger granted has a
    // sprite; this only guards a group that refused anyway.
    if (!sprite) return;
    sprite.setActive(true).setVisible(true).setPosition(host.x, host.y);
    sprite.anims.stop();
    showEffect(sprite, clip);
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
