import Phaser from 'phaser';
import {
  COMPANION_FX,
  COMPANION_KINDS,
  COMPANION_REACH,
  MAX_COMPANION_SHOTS,
  type CompanionSpellId,
} from '../config/companions';
import {
  chooseTarget,
  followVelocity,
  inReach,
  lungeVelocity,
  meleeTarget,
  spawnPosition,
  stepPosition,
} from '../core/companion';
import { BURN_DURATION } from '../config/spells';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import { Spell } from '../core/spell';
import type { CompanionStats } from '../core/spellStats';
import { Companion } from '../entities/Companion';
import type { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/**
 * A companion ally (#133, Phase 2 spec §9): one entity on the player's side
 * that follows them on a leash, picks its own targets and attacks on its own
 * `attackCooldown`, leaving behind whatever its element defines.
 *
 * One class serves all four companions and `config/companions.ts` decides which
 * is which. A **ranged** companion (Fire, Ice) hovers inside a short leash and
 * fires a pooled `Projectile` at the nearest enemy in `targetRange`. A **melee**
 * companion (Lightning, Earth) charges a target while that target is inside the
 * leash it keeps around the player, and strikes what is within `COMPANION_REACH`
 * when its attack comes due.
 *
 * The rules — the follow, the charge, the target, the reach, the step — live in
 * `core/companion.ts`; this class owns the sprite, the shot pool and the
 * translation of a strike into damage.
 *
 * Like Earth's ring it is always out rather than cast, so it overrides `tick`
 * to walk every frame; its attacks come off the scheduler reading
 * `attackCooldown` in place of `cooldown`, which is what lets Haste shorten the
 * wait between one swing and the next. Stepping from `tick` rather than from
 * `runChildUpdate` is what keeps a paused Game — a level-up overlay — from
 * letting the ally wander.
 *
 * The companion itself carries no body (see `entities/Companion.ts`), so it is
 * not damageable, does not block movement and cannot collide with an enemy. Its
 * shots are the only thing the collision system ever sees. Sprite, pool and
 * colliders all belong to the scene, so a run ending takes them with it.
 */
export class CompanionSpell extends Spell<CompanionSpellId> {
  private readonly scene: Phaser.Scene;
  private readonly companion: Companion;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** Ranged only; a melee companion never puts anything in the world. */
  private readonly shots: Phaser.Physics.Arcade.Group | undefined;
  /** Where the ally stands, in world px — its own, because it has no body to ask. */
  private position: Vec2;
  /** What it is going for this frame; picked once so it swings at what it chased. */
  private target: Enemy | undefined;
  /** Test hook (#133): attacks that landed on an enemy, shots and swings alike. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    id: CompanionSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<CompanionStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super(id, { ...stats });
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.position = spawnPosition(caster, stats.leashRadius);
    this.companion = new Companion(scene, this.position.x, this.position.y);
    if (COMPANION_KINDS[id] !== 'ranged') return;
    this.shots = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_COMPANION_SHOTS,
      // Shots fly on Arcade velocity and expire from `tick`, which only runs
      // while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.shots, (enemy, hitbox) => this.onShotHit(enemy, hitbox));
  }

  /** Whether this companion fights at range; `false` is a melee one. */
  get ranged(): boolean {
    return this.shots !== undefined;
  }

  /** Where the ally is standing — what the browser suite watches the leash with. */
  get at(): Vec2 {
    return { x: this.position.x, y: this.position.y };
  }

  /** Shots in the air right now; always 0 for a melee companion. */
  get liveCount(): number {
    return this.shots?.countActive(true) ?? 0;
  }

  /** Attacks this ally has landed — what the browser suite reads to see it fighting. */
  get hits(): number {
    return this.landed;
  }

  /** The live block, as the companion stats every one of these ids resolves to. */
  get companionStats(): Readonly<CompanionStats> {
    return this.stats;
  }

  protected override tick(deltaS: number): void {
    this.target = this.pickTarget();
    this.walk(deltaS);
    // After the walk, so an attack leaves from where the ally now stands.
    super.tick(deltaS);
    if (!this.shots) return;
    for (const child of this.shots.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  /**
   * The attack cadence. A companion has no `cooldown` of its own — it is always
   * out — so the scheduler runs on `attackCooldown` instead.
   */
  protected override get cooldown(): number {
    return this.companionStats.attackCooldown;
  }

  /** No target this frame → the attack waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return this.target?.active === true;
  }

  /** One attack: a shot for a ranged companion, a swing for a melee one. */
  protected cast(): void {
    const target = this.target;
    if (!target || !target.active) return;
    if (this.shots) this.shoot(target);
    else this.strike(target);
  }

  /**
   * What the ally is going for this frame. A ranged companion shoots the
   * nearest thing it can see; a melee one only counts what it may charge
   * without leaving the player's leash.
   */
  private pickTarget(): Enemy | undefined {
    const { targetRange, leashRadius } = this.companionStats;
    const live = this.enemies.live;
    return this.ranged
      ? chooseTarget(this.position, live, targetRange)
      : meleeTarget(this.position, live, this.caster, targetRange, leashRadius);
  }

  /**
   * One frame of the ally's walk. A ranged companion only ever follows; a melee
   * one charges this frame's target, which is the enemy it will swing at.
   */
  private walk(deltaS: number): void {
    const { leashRadius, chaseSpeed } = this.companionStats;
    const velocity = this.ranged
      ? followVelocity(this.position, this.caster, leashRadius, chaseSpeed)
      : lungeVelocity(this.position, this.target, this.caster, leashRadius, chaseSpeed);
    this.position = stepPosition(this.position, velocity, deltaS, this.scene.physics.world.bounds);
    this.companion.setPosition(this.position.x, this.position.y);
  }

  /** Ranged: `projectiles` shots leave the ally at the target it picked. */
  private shoot(target: Readonly<Vec2>): void {
    const { projectiles = 1, speed = 0, targetRange } = this.companionStats;
    const { x, y } = this.position;
    let fired = 0;
    for (let i = 0; i < Math.floor(projectiles); i += 1) {
      const shot = this.shots?.get(x, y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      // A shot expires at the range the ally could see its target from, so it
      // never outlives the reach the stat block promises.
      shot.fire(x, y, target, speed, targetRange, COMPANION_FX[this.id].shot);
      fired += 1;
    }
    const muzzle = COMPANION_FX[this.id].muzzle;
    if (fired > 0 && muzzle) this.fx.burst(muzzle, x, y);
  }

  /**
   * Melee: the swing lands only if the ally actually got there. A target it is
   * still running at costs it the attack — the scheduler charges again from
   * zero, so it never banks swings while it closes.
   */
  private strike(target: Enemy): void {
    if (!inReach(this.position, target, target.bodyRadius, COMPANION_REACH)) return;
    this.onCompanionHit(target);
  }

  private onShotHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    hitbox.despawn();
    this.onCompanionHit(enemy);
  }

  /**
   * What one companion attack costs the enemy it lands on: `damage`, plus the
   * element's own mark — Fire's burn, Ice's chill, Lightning's stagger (#139),
   * Earth's shove.
   */
  private onCompanionHit(enemy: Enemy): void {
    const { damage, burn, burnDuration, slowPct, slowDuration, staggerDuration, knockback } =
      this.companionStats;
    this.landed += 1;
    const clip = COMPANION_FX[this.id];
    this.fx.burst(clip.hit, enemy.x, enemy.y, { scale: clip.hitScale });
    if (burn) enemy.applyBurn(burn, burnDuration ?? BURN_DURATION);
    if (slowPct) enemy.applyFrost({ slowPct, slowDuration: slowDuration ?? 0, freeze: false });
    if (staggerDuration) enemy.applyStagger(staggerDuration);
    // The shove is measured before the blow, so a killing hit drops its gems
    // where the enemy stood rather than where it would have been thrown.
    const push = knockback ? knockbackVector(this.position, enemy, knockback, this.caster) : null;
    this.damage(enemy, damage);
    if (!push || !enemy.active) return;
    enemy.knockBack(push);
    this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
  }
}
