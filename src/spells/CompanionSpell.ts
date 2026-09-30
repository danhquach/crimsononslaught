import Phaser from 'phaser';
import {
  COMPANION_FX,
  COMPANION_KINDS,
  COMPANION_REACH,
  MAX_COMPANION_SHOTS,
  type CompanionSpellId,
} from '../config/companions';
import { COMPANION_FIREBALL, COMPANION_SHOT_GAP_PX } from '../config/fireLevels';
import { FROST_ORB } from '../config/iceLevels';
import { COMPANION_SWEEP, MAX_LIVE_COMPANION_STRIPS, THUNDERCLAP } from '../config/lightningLevels';
import { METEOR_POND_LOOK } from '../config/strikes';
import type { SpellLevel } from '../config/spellLevels';
import {
  chooseTarget,
  companionEmpowerment,
  followVelocity,
  inReach,
  lungeVelocity,
  meleeTarget,
  spawnPosition,
  stepPosition,
  volleyLanes,
} from '../core/companion';
import { BURN_DURATION } from '../config/spells';
import {
  DEFAULT_FACING,
  companionAnimation,
  companionFacing,
  type Facing,
} from '../core/animation';
import { recordCapped } from '../core/fireLevels';
import { splashTargets } from '../core/fireball';
import { pulseTargets } from '../core/frostNova';
import { dustFlip, explosionScale, novaScale } from '../core/fx';
import { frostOrbHit } from '../core/iceLevels';
import {
  companionAttackCooldown,
  hasCompanionSweep,
  hasThunderclap,
  sweepChord,
  sweepTargets,
  thunderclapPath,
} from '../core/lightningLevels';
import { createArea, membersOf } from '../core/groundArea';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import { Spell } from '../core/spell';
import type { CompanionStats } from '../core/spellStats';
import { Boss } from '../entities/Boss';
import { Companion } from '../entities/Companion';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { AreaPool } from '../systems/AreaPool';
import { ChainStripPool } from '../systems/ChainStripPool';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import { clipDurationMs } from '../render/animate';
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
 * Levels (#327, #328): level 2 adds a shot (`projectiles`), and a ranged
 * companion flies a volley's shots side by side, `COMPANION_SHOT_GAP_PX` apart,
 * so they read as two and each still connects with a small enemy. Level 3, for
 * the companions in `COMPANION_EMPOWERED`: every 4th attack's first shot is
 * empowered. Fire's is a fireball, which on hit also blasts what stands near it
 * and leaves a burning patch; Ice's is a frost orb, which freezes the enemy it
 * lands on (`FROST_ORB.freezeS`, through `applyFrost`, so a boss's diminishing
 * returns cap it) and slows what stands near it. The level is taken when the
 * shot leaves.
 *
 * Levels (#329), the Lightning Companion (melee): from level 2 it attacks twice
 * as fast (`companionAttackCooldown`), and a swing that lands also arcs across
 * the 100 degrees in front of it (`COMPANION_SWEEP`), staggering and hitting up
 * to four other enemies for half its damage; the arc is drawn as one chain
 * strip across the cone's chord. Level 3, Thunderclap: the swing also chains on
 * from its target to up to three more enemies (`THUNDERCLAP`) for 60% of its
 * damage. Every stagger is the companion's own, so a boss's diminishing returns
 * cap it; none stuns and none rolls, so nothing draws from the RNG. The strips
 * are a pool of their own, capped at `MAX_LIVE_COMPANION_STRIPS`. The level is
 * taken when the swing lands.
 *
 * The companion itself carries no body (see `entities/Companion.ts`), so it is
 * not damageable, does not block movement and cannot collide with an enemy. Its
 * shots are the only thing the collision system ever sees. Sprite, pool and
 * colliders all belong to the scene, so a run ending takes them with it.
 */
/** The fireball wears Fire Bolt's clip, larger, so it reads apart from the companion's usual shot. */
const FIREBALL_LOOK: ProjectileLook = {
  texture: 'proj_fire',
  clip: 'fire.ball',
  scale: COMPANION_FIREBALL.drawScale,
};

/** The frost orb wears the Ice Bomb's clip at half size, so it reads apart from the usual shard and adds no art (#328). */
const FROST_ORB_LOOK: ProjectileLook = {
  texture: 'proj_ice',
  clip: FROST_ORB.clip,
  scale: FROST_ORB.drawScale,
};

/** An empowered shot in the air: which kind it is and the level it left at. */
interface Empowered {
  readonly kind: 'fireball' | 'frostOrb';
  readonly level: SpellLevel;
}

/** A ranged companion's level record, what the test hook reads (#327): cause and effect in one entry. */
export interface CompanionLevelReport {
  volleys: {
    level: SpellLevel;
    attackNumber: number;
    shots: number;
    fireball: boolean;
    frostOrb: boolean;
  }[];
  fireballs: {
    level: SpellLevel;
    caught: number;
    pondPlaced: boolean;
    x: number;
    y: number;
  }[];
  /**
   * Each frost orb that landed: whether its target was a boss, the seconds the
   * target was frozen for right after the orb's own freeze (read before the hit's
   * damage), and the neighbours it chilled against the neighbours it reached.
   */
  frostOrbs: {
    level: SpellLevel;
    boss: boolean;
    targetFrozenS: number;
    around: number;
    slowedAround: number;
    x: number;
    y: number;
  }[];
  /** Shots in the air right now, for the pool-cap check. */
  liveShots: number;
  /**
   * The Lightning Companion's landed swings (#329), at the level each landed at:
   * the cadence its attacks run on now against its base `attackCooldown`, the
   * enemies its front arc caught and how many of them were hit, and the enemies
   * its Thunderclap reached against the strips drawn for them. Empty for every
   * other companion.
   */
  swings: {
    level: SpellLevel;
    cadenceS: number;
    attackCooldownS: number;
    swept: number;
    sweptHit: number;
    thunderclapHits: number;
    thunderclapStrips: number;
  }[];
  /** Strips up right now, for the pool-cap check; 0 for every other companion. */
  liveStrips: number;
}

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
  /** This frame's walk, which the move clip and the facing are read from. */
  private velocity: Vec2 = { x: 0, y: 0 };
  private facing: Facing = DEFAULT_FACING;
  /** From the ally to what it attacked this frame; unset on a frame with no attack. */
  private aim: Vec2 | undefined;
  /** Run-clock time left on the attack clip (#184), so a paused Game holds it. */
  private attackMs = 0;
  /** Test hook (#184): attack clips started, shots and landed swings alike. */
  private attacksStarted = 0;
  /** Volleys that fired: the count level 3's empowered attack is every Nth of. */
  private attackNumber = 0;
  /** Empowered shots in the air, with the kind and level each left at. Cleared on every despawn path. */
  private readonly empowered = new Map<Projectile, Empowered>();
  private readonly volleyLog: CompanionLevelReport['volleys'] = [];
  private readonly fireballLog: CompanionLevelReport['fireballs'] = [];
  private readonly frostOrbLog: CompanionLevelReport['frostOrbs'] = [];
  private readonly areas: AreaPool | undefined;
  /** The Lightning Companion's arc and Thunderclap strips (#329); no other companion draws any. */
  private readonly strips: ChainStripPool | undefined;
  private readonly swingLog: CompanionLevelReport['swings'] = [];

  constructor(
    scene: Phaser.Scene,
    id: CompanionSpellId,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<CompanionStats>,
    damage: DamageSink,
    fx: FxPool,
    areas?: AreaPool,
  ) {
    super(id, { ...stats });
    this.areas = areas;
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.position = spawnPosition(caster, stats.leashRadius);
    this.companion = new Companion(scene, this.position.x, this.position.y);
    if (id === 'lightning_companion') {
      this.strips = new ChainStripPool(scene, MAX_LIVE_COMPANION_STRIPS);
    }
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

  /** Attack clips this ally has played — what the browser suite reads to see it swing. */
  get attacksShown(): number {
    return this.attacksStarted;
  }

  /** The clip on screen now and every clip it has shown, for the browser suite. */
  get clips(): { current: string | null; shown: string[] } {
    return { current: this.companion.clip, shown: [...this.companion.clipsShown] };
  }

  /** Test hook (#327, #328): the volleys this ally has shot and the fireballs and frost orbs that landed. */
  get levelReport(): CompanionLevelReport {
    return {
      volleys: [...this.volleyLog],
      fireballs: [...this.fireballLog],
      frostOrbs: [...this.frostOrbLog],
      liveShots: this.liveCount,
      swings: [...this.swingLog],
      liveStrips: this.strips?.liveCount ?? 0,
    };
  }

  /** The live block, as the companion stats every one of these ids resolves to. */
  get companionStats(): Readonly<CompanionStats> {
    return this.stats;
  }

  protected override tick(deltaS: number): void {
    this.strips?.update(deltaS);
    this.attackMs = Math.max(0, this.attackMs - deltaS * 1000);
    this.target = this.pickTarget();
    this.walk(deltaS);
    // After the walk, so an attack leaves from where the ally now stands.
    super.tick(deltaS);
    this.animate();
    if (!this.shots) return;
    for (const child of this.shots.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.retire(child);
    }
  }

  /**
   * The attack cadence. A companion has no `cooldown` of its own — it is always
   * out — so the scheduler runs on `attackCooldown` instead; the Lightning
   * Companion's is halved from level 2 (#329).
   */
  protected override get cooldown(): number {
    return companionAttackCooldown(this.id, this.companionStats.attackCooldown, this.level);
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
    this.velocity = velocity;
    this.position = stepPosition(this.position, velocity, deltaS, this.scene.physics.world.bounds);
    this.companion.setPosition(this.position.x, this.position.y);
  }

  /**
   * The clip for this frame (#184): an attack started this frame plays from its
   * first frame facing the target, and holds for its run-clock length; after
   * it the ally walks or idles in the facing it moves in.
   */
  private animate(): void {
    const aim = this.aim;
    this.aim = undefined;
    const { sprite } = COMPANION_FX[this.id];
    const attacking = this.attackMs > 0;
    this.facing = companionFacing({ velocity: this.velocity, aim, attacking }, this.facing);
    if (aim) {
      const clip = companionAnimation({
        sprite,
        facing: this.facing,
        moving: false,
        attacking: true,
      });
      this.attackMs = clipDurationMs(this.scene, clip);
      if (this.attackMs > 0) this.attacksStarted += 1;
      this.companion.show(clip, true);
      return;
    }
    const moving = this.velocity.x !== 0 || this.velocity.y !== 0;
    this.companion.show(companionAnimation({ sprite, facing: this.facing, moving, attacking }));
  }

  /** Face `target` and play the attack this frame. */
  private startAttack(target: Readonly<Vec2>): void {
    this.aim = { x: target.x - this.position.x, y: target.y - this.position.y };
  }

  /**
   * Ranged: `projectiles` shots leave the ally, side by side along the line to
   * the target it picked. On level 3's empowered attack the first is the
   * companion's empowered shot: a fireball, or Ice's frost orb.
   */
  private shoot(target: Readonly<Vec2>): void {
    const { projectiles = 1, speed = 0, targetRange } = this.companionStats;
    const { x, y } = this.position;
    const level = this.level;
    const number = this.attackNumber + 1;
    const kind = companionEmpowerment(this.id, number, level);
    const lanes = volleyLanes(
      this.position,
      target,
      Math.floor(projectiles),
      COMPANION_SHOT_GAP_PX,
    );
    let fired = 0;
    let fireball = false;
    let frostOrb = false;
    for (const [i, lane] of lanes.entries()) {
      const shot = this.shots?.get(lane.from.x, lane.from.y) as Projectile | null;
      // Pool exhausted: the rest of the volley is dropped, never queued.
      if (!shot) break;
      const kindOfShot = i === 0 ? kind : null;
      // A shot expires at the range the ally could see its target from, so it
      // never outlives the reach the stat block promises.
      shot.fire(
        lane.from.x,
        lane.from.y,
        lane.to,
        speed,
        targetRange,
        kindOfShot === 'fireball'
          ? FIREBALL_LOOK
          : kindOfShot === 'frostOrb'
            ? FROST_ORB_LOOK
            : COMPANION_FX[this.id].shot,
      );
      if (kindOfShot) this.empowered.set(shot, { kind: kindOfShot, level });
      else this.empowered.delete(shot);
      fireball ||= kindOfShot === 'fireball';
      frostOrb ||= kindOfShot === 'frostOrb';
      fired += 1;
    }
    if (fired > 0) {
      this.attackNumber = number;
      this.startAttack(target);
      recordCapped(this.volleyLog, {
        level,
        attackNumber: number,
        shots: fired,
        fireball,
        frostOrb,
      });
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
    this.startAttack(target);
    const arc = this.strips ? this.resolveArc(target) : undefined;
    this.onCompanionHit(target, this.position);
    if (arc) this.landArc(target, arc.swept, arc.aimRad);
  }

  /**
   * The Lightning Companion's front arc for a swing on `target` (levels 2 and
   * 3): who it catches, resolved before any damage lands so a kill cannot change
   * the crowd it reads.
   */
  private resolveArc(target: Enemy): { swept: Enemy[]; aimRad: number } | undefined {
    if (!hasCompanionSweep(this.level)) return undefined;
    const aimRad = Math.atan2(target.y - this.position.y, target.x - this.position.x);
    const swept = sweepTargets(this.position, aimRad, this.enemies.live, undefined, undefined, [
      target,
    ]);
    return { swept, aimRad };
  }

  /**
   * The rest of a landed swing at level 2 and 3, after the direct hit: a chord
   * strip and an impact on each enemy of the front arc, each staggered for the
   * companion's own stagger and dealt half its damage; from level 3 a
   * Thunderclap from the target through up to three more, each a strip and a
   * stagger and 60% of the damage. `swept` was resolved before the direct hit.
   */
  private landArc(target: Enemy, swept: readonly Enemy[], aimRad: number): void {
    const { damage, staggerDuration } = this.companionStats;
    const level = this.level;
    const strips = this.strips;
    if (!strips) return;
    const chord = sweepChord(this.position, aimRad);
    strips.lay(chord.from, chord.to);
    let sweptHit = 0;
    for (const enemy of swept) {
      if (!enemy.active) continue;
      sweptHit += 1;
      this.fx.burst('lightning.impact', enemy.x, enemy.y, { scale: COMPANION_SWEEP.impactScale });
      if (staggerDuration) enemy.applyStagger(staggerDuration);
      this.damage(enemy, damage * COMPANION_SWEEP.damageFactor, 'hit', this.position);
    }
    const clap = hasThunderclap(level)
      ? thunderclapPath(target, this.enemies.live, new Set([target, ...swept]))
      : [];
    let clapStrips = 0;
    let from: Readonly<Vec2> = { x: target.x, y: target.y };
    for (const enemy of clap) {
      if (strips.lay(from, enemy)) clapStrips += 1;
      const link = from;
      from = { x: enemy.x, y: enemy.y };
      if (staggerDuration) enemy.applyStagger(staggerDuration);
      this.damage(enemy, damage * THUNDERCLAP.damageFactor, 'hit', link);
    }
    recordCapped(this.swingLog, {
      level,
      cadenceS: this.cooldown,
      attackCooldownS: this.companionStats.attackCooldown,
      swept: swept.length,
      sweptHit,
      thunderclapHits: clap.length,
      thunderclapStrips: clapStrips,
    });
  }

  private onShotHit(enemy: Enemy, hitbox: SpellHitbox): void {
    // A shot is spent on its first hit; a later overlap the same frame, or one
    // with an enemy something else already killed, flies on.
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const special = this.empowered.get(hitbox);
    this.retire(hitbox);
    if (special?.kind === 'frostOrb') {
      this.landFrostOrb(enemy, hitbox, special.level);
      return;
    }
    // The blast is resolved against the crowd as it stands before the hit lands.
    const burst = special?.kind === 'fireball' ? this.fireballBlast(enemy) : undefined;
    this.onCompanionHit(enemy, hitbox);
    if (special?.kind === 'fireball' && burst) this.finishFireball(burst, special.level);
  }

  private retire(shot: Projectile): void {
    this.empowered.delete(shot);
    shot.despawn();
  }

  /**
   * A frost orb landing on `enemy` (level 3), in the order that keeps a killing
   * blow from skipping its frost: who stands near is resolved before the hit,
   * the freeze goes on, the normal hit lands, then the neighbours are slowed.
   * The frozen time is read right after the freeze, before the hit can remove
   * the enemy, and it is whatever `applyFrost` left: a boss's is capped by its
   * diminishing returns, never stretched.
   */
  private landFrostOrb(enemy: Enemy, from: Readonly<Vec2>, level: SpellLevel): void {
    const { slowRadius, slowPct, slowDurationS } = FROST_ORB;
    const at = { x: enemy.x, y: enemy.y };
    const around = pulseTargets(at, this.enemies.live, slowRadius).filter(
      (other) => other !== enemy,
    );
    enemy.applyFrost(frostOrbHit(this.companionStats));
    const targetFrozenS = enemy.crowdControlRemainingS.frozenS;
    const boss = enemy instanceof Boss;
    this.onCompanionHit(enemy, from);
    this.fx.burst('ice.nova', at.x, at.y, { scale: novaScale(slowRadius) });
    let slowedAround = 0;
    for (const other of around) {
      if (!other.active) continue;
      other.applyFrost({ slowPct, slowDuration: slowDurationS, freeze: false });
      if (other.slowed) slowedAround += 1;
    }
    recordCapped(this.frostOrbLog, {
      level,
      boss,
      targetFrozenS,
      around: around.length,
      slowedAround,
      x: at.x,
      y: at.y,
    });
  }

  /** Who a fireball bursting on `enemy` will catch, before the direct hit lands. */
  private fireballBlast(enemy: Enemy): { caught: Enemy[]; at: Vec2 } {
    return {
      caught: splashTargets(enemy, this.enemies.live, COMPANION_FIREBALL.radius, enemy),
      at: { x: enemy.x, y: enemy.y },
    };
  }

  /** The fireball's burst on top of the normal hit: a blast for whoever stood near, and a burning patch. */
  private finishFireball({ caught, at }: { caught: Enemy[]; at: Vec2 }, level: SpellLevel): void {
    const { radius, blastFactor, pond } = COMPANION_FIREBALL;
    this.fx.burst('fire.explode', at.x, at.y, { scale: explosionScale(radius) });
    const blast = this.companionStats.damage * blastFactor;
    for (const other of caught) this.damage(other, blast, 'hit', at);
    const patch = createArea(at, {
      radius: pond.radius,
      durationS: pond.durationS,
      tickEveryS: pond.tickEveryS,
    });
    const pondPlaced =
      this.areas?.place(
        patch,
        (live) => {
          for (const member of membersOf(live, this.enemies.live)) {
            this.damage(member, pond.tickDamage, 'tick', live);
          }
        },
        {},
        METEOR_POND_LOOK,
      ) ?? false;
    recordCapped(this.fireballLog, { level, caught: caught.length, pondPlaced, x: at.x, y: at.y });
  }

  /**
   * What one companion attack costs the enemy it lands on: `damage`, plus the
   * element's own mark — Fire's burn, Ice's chill, Lightning's stagger (#139),
   * Earth's shove. `from` is where it struck from: the ally's swing or its shot.
   */
  private onCompanionHit(enemy: Enemy, from: Readonly<Vec2>): void {
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
    this.damage(enemy, damage, 'hit', from);
    if (!push || !enemy.active) return;
    enemy.knockBack(push);
    this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
  }
}
