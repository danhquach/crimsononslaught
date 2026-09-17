import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { XpGem } from '../entities/XpGem';
import type { EnemyPool } from './EnemyPool';
import type { GemPool } from './GemPool';

/**
 * Anything a spell puts in the world to hurt enemies with: a fireball, a nova
 * ring, a chain bolt's segment, an orbiting boulder (Epic D). Spells own the
 * sprite and its lifetime; all this file needs is a body to overlap with.
 */
export type SpellHitbox = Phaser.Types.Physics.Arcade.GameObjectWithBody;

/** What to do when a run-wide pair touches. Handlers run on the frame of the overlap. */
export interface CollisionHandlers {
  /** An enemy is touching the player (spec §5: contact damage). */
  readonly onEnemyContact: (enemy: Enemy) => void;
  /** The player is touching a gem (spec §5: gems are XP on touch). */
  readonly onGemPickup: (gem: XpGem) => void;
}

/** A live spell hitbox is touching an enemy; the spell that owns the group resolves it (Epic D). */
export type SpellHitHandler = (enemy: Enemy, hitbox: SpellHitbox) => void;

/**
 * The one place overlaps are registered (spec §9). Enemy <-> player and
 * gem <-> player are wired on construction; spell <-> enemy is wired per spell
 * group through `addSpellGroup`, because spells create their groups as they are
 * cast (Epic D) rather than at the start of the run.
 *
 * It only routes: the rules of a hit (cooldowns, damage, drops) live with the
 * handlers in `GameScene`. Colliders are owned by the scene's physics world, so
 * a scene shutdown takes them with it and nothing here needs disposing.
 *
 * Registering an overlap anywhere else splits the wiring and is what this class
 * exists to prevent — `core/collisionWiring.test.ts` fails the build if it happens.
 */
export class CollisionSystem {
  private readonly scene: Phaser.Scene;
  private readonly enemies: EnemyPool;
  private readonly handlers: CollisionHandlers;

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    enemies: EnemyPool,
    gems: GemPool,
    handlers: CollisionHandlers,
  ) {
    this.scene = scene;
    this.enemies = enemies;
    this.handlers = handlers;

    this.scene.physics.add.overlap(player, enemies.group, (_player, enemy) => {
      if (enemy instanceof Enemy) this.handlers.onEnemyContact(enemy);
    });
    this.scene.physics.add.overlap(player, gems.group, (_player, gem) => {
      if (gem instanceof XpGem) this.handlers.onGemPickup(gem);
    });
  }

  /**
   * Wire one spell's hitboxes against the enemy pool; call once per group as
   * the spell creates it (Epic D). The handler comes with the group rather than
   * with the run, because what a hit costs is the spell's own business.
   */
  addSpellGroup(group: Phaser.Physics.Arcade.Group, onHit: SpellHitHandler): void {
    this.scene.physics.add.overlap(group, this.enemies.group, (hitbox, enemy) => {
      if (enemy instanceof Enemy) onHit(enemy, hitbox as SpellHitbox);
    });
  }
}
