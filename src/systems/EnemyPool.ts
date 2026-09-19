import Phaser from 'phaser';
import { MAX_LIVE_ENEMIES, type EnemyType } from '../config/enemies';
import { canSpawn, type Vec2 } from '../core/enemy';
import { Boss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';

/**
 * The enemy object pool (spec §5): one Arcade group of at most
 * `MAX_LIVE_ENEMIES` reusable `Enemy` sprites. A dead enemy goes back to the
 * pool instead of being destroyed, so a run allocates 300 sprites at worst and
 * none after that.
 *
 * `spawn` returns `null` once the cap is reached — the request is dropped, never
 * queued (spec §5), so the spawn director (CO-025) can ask freely.
 *
 * The boss (CO-050) joins the same group through `spawnBoss`, so every spell's
 * targeting (`live`) and overlap wiring (`group`) reaches it with no special
 * case. It is one of a kind, never recycled: it leaves the group when it dies.
 *
 * `group` is the overlap target for collisions (CollisionSystem, CO-032).
 */
export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;
  private bossSprite: Boss | null = null;

  constructor(scene: Phaser.Scene) {
    this.group = scene.physics.add.group({
      classType: Enemy,
      // Deliberately redundant with `canSpawn` below: this caps how many sprites
      // the pool may ever allocate, `canSpawn` caps how many may be alive. Both
      // read `MAX_LIVE_ENEMIES`, so dropping either changes the cap's meaning.
      // The extra slot is the boss's (CO-050): `group.add` refuses a full
      // group, and the boss must land even over a full crowd.
      maxSize: MAX_LIVE_ENEMIES + 1,
      // Enemies are updated from `update` below with the player's position,
      // and only while Game runs, so a paused scene freezes them.
      runChildUpdate: false,
    });
  }

  /**
   * Enemies holding a pool slot right now; pooled-but-dead ones do not count.
   * One playing its death clip (CO-081) still does: its sprite is not free,
   * and the cap below must see every slot `group.get` cannot hand out, or the
   * group fills past `MAX_LIVE_ENEMIES` and `spawnBoss` has no room to land.
   */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Spawn one enemy, or `null` when the live cap is already reached. */
  spawn(type: EnemyType, x: number, y: number): Enemy | null {
    // A boss killed since the last update walk is still a dead member here,
    // and `group.get` hands out the first dead member whatever its class.
    this.releaseDeadBoss();
    if (!canSpawn(this.liveCount)) return null;
    const enemy = this.group.get(x, y) as Enemy | null;
    if (!enemy) return null;
    enemy.spawn(type, x, y);
    return enemy;
  }

  /**
   * Bring the boss into the world at (x, y) (CO-050). The Boss sprite is made
   * when none is in the group and appended to it; a call while one lives puts
   * that sprite back at full HP where asked.
   */
  spawnBoss(x: number, y: number): Boss {
    this.releaseDeadBoss();
    if (!this.bossSprite) {
      this.bossSprite = new Boss(this.group.scene);
      this.group.add(this.bossSprite, true);
    }
    this.bossSprite.spawnBoss(x, y);
    return this.bossSprite;
  }

  /**
   * Every enemy alive in the world right now, in pool order. One playing its
   * death clip (CO-081) is still `active` — so `group.get` cannot reuse it —
   * but no longer here: nothing targets or counts a dead enemy.
   */
  get live(): Enemy[] {
    const live: Enemy[] = [];
    for (const child of this.group.getChildren()) {
      if (child instanceof Enemy && child.active && !child.isDying) live.push(child);
    }
    return live;
  }

  /**
   * Step every live enemy toward `target`. Damage-over-time owed this frame —
   * burn (CO-044) and bleed (#139) — is handed to `onDamage` so the run applies
   * it and its kills count.
   */
  update(
    deltaMs: number,
    target: Readonly<Vec2>,
    onDamage?: (enemy: Enemy, amount: number) => void,
  ): void {
    for (const child of this.group.getChildren()) {
      if (!(child instanceof Enemy) || !child.active) continue;
      const dot = child.chase(deltaMs, target);
      if (dot > 0) onDamage?.(child, dot);
    }
    this.releaseDeadBoss();
  }

  /**
   * A dead boss leaves the group for good — destroyed, not pooled — so
   * `group.get` can never hand its sprite out as the next swarm. Called after
   * the update walk (never inside it: the children array must not be edited
   * under the loop) and before anything is taken from the group.
   */
  private releaseDeadBoss(): void {
    if (!this.bossSprite || this.bossSprite.active) return;
    this.group.remove(this.bossSprite, true, true);
    this.bossSprite = null;
  }
}
