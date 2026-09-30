import Phaser from 'phaser';
import { PLACEHOLDERS } from '../config/colors';
import { LANDSLIDE, MAX_LIVE_RUT_TILES, RUT_CLIP, RUT_VARIANTS } from '../config/earthLevels';
import { ROLLING_BOULDER_CLIP, ROLLING_BOULDER_TEXTURE } from '../config/earthRoster';
import { ART_BOXES, FRAMES, type FrameName } from '../config/frames';
import { AREA_ART_DEPTH } from '../config/fx';
import type { SpellLevel } from '../config/spellLevels';
import {
  boulderHeadings,
  bouldersPerCast,
  rutAlpha,
  rutStaggerS,
  rutTickDamage,
  rutTilesDue,
  rutWindowOffset,
  ruttedBy,
  type RutTile,
} from '../core/earthLevels';
import { recordCapped } from '../core/fireLevels';
import { dustFlip } from '../core/fx';
import type { Vec2 } from '../core/input';
import { spawnsDue } from '../core/iceStorm';
import { knockbackVector } from '../core/orbitingBoulders';
import { MAX_LIVE_BOULDERS, rollSpent, rollTarget } from '../core/rollingBoulder';
import { Spell, anyWithin, nearestEnemies } from '../core/spell';
import type { BoulderStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileLook } from '../entities/Projectile';
import type { CollisionSystem, SpellHitbox } from '../systems/CollisionSystem';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** A thrown boulder's body: the ring's own stone, rolling (see `config/earthRoster.ts`). */
const BOULDER_LOOK: ProjectileLook = {
  texture: ROLLING_BOULDER_TEXTURE,
  clip: ROLLING_BOULDER_CLIP,
};

/** What one live boulder remembers from its throw (#330): the level it rolls at and, for a Landslide, where its rut lies. */
interface BoulderFlight {
  readonly level: SpellLevel;
  /** Where it was thrown from: the rut is laid along the line from here. */
  readonly origin: Readonly<Vec2>;
  /** The unit heading of the throw, which every tile of its rut lies along. */
  readonly dirX: number;
  readonly dirY: number;
  /** Rut tiles this boulder has laid, and tiles refused (cap); together they are how many are due to have been. */
  placed: number;
  dropped: number;
}

/** A rut tile on the ground: where it lies and what it costs, when it was laid and the sprite drawing it. */
interface LiveTile extends RutTile {
  readonly laidAtS: number;
  /** Null with no atlas: the tile still hurts, nothing is drawn. */
  readonly sprite: Phaser.GameObjects.Sprite | null;
}

/** Boulder's level record, what the test hook reads (#330): cause and effect in one entry. */
export interface BoulderLevelReport {
  /** Every throw that sent a boulder, at the level it was thrown at: boulders sent, and how many were aimed at an enemy of their own. */
  throws: { level: SpellLevel; boulders: number; distinctTargets: number }[];
  /** Every level 3 boulder's rut, logged as it despawns: the level, tiles it laid and tiles dropped at the cap. */
  rut: { level: SpellLevel; tiles: number; dropped: number }[];
  /** Rut tiles laid so far, all boulders: a count the capped log cannot lose. */
  rutTileCount: number;
  /** Rut tiles on the ground right now; never more than `MAX_LIVE_RUT_TILES`. */
  liveRutTiles: number;
  /** Ticks the rut has run, and staggers they applied: counts a poll need not catch in 0.15 s. */
  rutTicks: number;
  rutStaggers: number;
  /** Rut hits dealt, and the damage they carried: what shows the rut hurts, not only staggers. */
  rutHits: number;
  rutDamage: number;
  /** Boulders the spell holds an entry for; never more than `liveBoulders`. */
  tracked: number;
  liveBoulders: number;
}

/**
 * Boulder (#143, Phase 2 spec §9.5): every `cooldown` s a heavy stone is
 * thrown at the nearest enemy within `range` and keeps rolling past it. Each
 * enemy it rolls over is struck once for `damage` and hurled `knockback` px
 * away; the boulder despawns once it has struck `pierce` of them or has flown
 * its `range` (`Projectile.spent`).
 *
 * The rules — the throw's heading, when a boulder is used up — live in
 * `core/rollingBoulder.ts`, and the shove is the ring's `knockbackVector`
 * (`core/orbitingBoulders.ts`), the one every Earth spell pushes with. This
 * class owns the projectile pool, registers it with `CollisionSystem` (the one
 * place overlaps are wired, CO-032) and keeps each live boulder's own set of
 * enemies struck, so a boulder never hits the same enemy twice while it rolls
 * over it and two boulders in the air count their pierce separately.
 *
 * Levels (#330): level 2 throws `BOULDER_SPLIT.count` boulders a cast, the
 * second at the second-nearest enemy or, with only one in range, fanned off the
 * first. Level 3, Landslide: a boulder lays a straight rut along its whole path
 * (`LANDSLIDE`), a tile every `spacingPx` it rolls, each `RUT_CLIP` art on the
 * ground layer, kept in a pool of its own (`MAX_LIVE_RUT_TILES`, a tile past it
 * is dropped and counted). Tiles outlive their boulder and fade from the throw
 * end. The spell runs ONE rut clock: every `tickEveryS` each enemy standing on
 * any tile is hurt and staggered once, so trails that cross never stack. A
 * boulder keeps the level it was thrown at; its entry is dropped when it
 * despawns, and `Projectile.fire` puts a reused one back to native scale.
 *
 * FX (CO-082): `earth.impact` plays at every strike and `earth.dust` kicks up
 * under each survivor, blowing the way it was hurled.
 */
export class RollingBoulderSpell extends Spell<'earth_boulder'> {
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  /** The rut tiles' sprites, pooled apart from the shared area pool. */
  private readonly rutGroup: Phaser.GameObjects.Group;
  /** Per live boulder: the enemies it has already struck, and how many that is. */
  private readonly struck = new Map<Projectile, Set<Enemy>>();
  /** Per live boulder: what its throw fixed (#330). */
  private readonly flights = new Map<Projectile, BoulderFlight>();
  private readonly throwLog: BoulderLevelReport['throws'] = [];
  private readonly rutLog: BoulderLevelReport['rut'] = [];
  /** Every rut tile on the ground, whichever boulder laid it, oldest first. */
  private readonly tiles: LiveTile[] = [];
  /** The run clock: seconds this spell has been ticked, what a tile's age is read from. */
  private clockS = 0;
  /** The one rut clock: seconds since the ground was last bare, what the ticks are counted on. */
  private rutClockS = 0;
  private rutLaid = 0;
  private rutTickCount = 0;
  private rutStaggerCount = 0;
  private rutHitCount = 0;
  private rutDamageDealt = 0;
  /** Test hook (#143): strikes this spell has landed, across every boulder. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    collisions: CollisionSystem,
    stats: Readonly<BoulderStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('earth_boulder', stats);
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
    this.rutGroup = scene.add.group({
      classType: Phaser.GameObjects.Sprite,
      maxSize: MAX_LIVE_RUT_TILES,
      createCallback: (child) => (child as Phaser.GameObjects.Sprite).setDepth(AREA_ART_DEPTH),
    });
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_BOULDERS,
      // Boulders roll on Arcade velocity and expire from `tick`, which only
      // runs while Game does, so a paused scene freezes them.
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.group, (enemy, hitbox) => this.onOverlap(enemy, hitbox));
  }

  /** Boulders rolling right now. */
  get liveCount(): number {
    return this.group.countActive(true);
  }

  /** Strikes this spell has landed, across every boulder — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  /** Test hook (#330): the throws and ruts this spell has made. */
  get levelReport(): BoulderLevelReport {
    return {
      throws: [...this.throwLog],
      rut: [...this.rutLog],
      rutTileCount: this.rutLaid,
      liveRutTiles: this.tiles.length,
      rutTicks: this.rutTickCount,
      rutStaggers: this.rutStaggerCount,
      rutHits: this.rutHitCount,
      rutDamage: this.rutDamageDealt,
      tracked: this.flights.size,
      liveBoulders: this.liveCount,
    };
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    this.clockS += deltaS;
    for (const [boulder, flight] of this.flights) this.layRut(boulder, flight);
    this.ageRut();
    this.tickRut(deltaS);
    for (const child of this.group.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) this.despawn(child);
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /**
   * One throw, at the nearest enemy within `range`: a boulder, or from level 2
   * `BOULDER_SPLIT.count`, each at an enemy of its own where there are enough.
   * With nothing in range the cast is spent on nothing, the same rule
   * Fireball's volley follows with an empty crowd. Level 1 rolls at the target
   * itself, exactly as it always did.
   */
  protected cast(): void {
    const { range, speed, radius } = this.stats;
    const { x, y } = this.caster;
    const level = this.level;
    const count = bouldersPerCast(level);
    const aims =
      level >= 2
        ? boulderHeadings(this.caster, this.enemies.live, count, range).map((h) => ({
            x: x + h.x * range,
            y: y + h.y * range,
          }))
        : [rollTarget(this.caster, this.enemies.live, range)];
    const baseScale = radius / (PLACEHOLDERS[ROLLING_BOULDER_TEXTURE].width / 2);
    const origin = { x, y };
    let sent = 0;
    for (const aim of aims) {
      if (!aim) return;
      const reach = Math.hypot(aim.x - x, aim.y - y);
      // Pool exhausted: the rest of the throw is dropped, never queued.
      const boulder = this.group.get(x, y) as Projectile | null;
      if (!boulder) break;
      boulder.fire(x, y, aim, speed, range, BOULDER_LOOK);
      // The placeholder is drawn at its own size; scaling the sprite scales its
      // Arcade body with it, so the stone hits exactly as wide as it looks and an
      // area passive widens both.
      boulder.setScale(baseScale);
      this.struck.set(boulder, new Set());
      // Straight flight: the rut lies along the heading the throw fixed.
      const dirX = reach > 0 ? (aim.x - x) / reach : 1;
      const dirY = reach > 0 ? (aim.y - y) / reach : 0;
      this.flights.set(boulder, { level, origin, dirX, dirY, placed: 0, dropped: 0 });
      sent += 1;
    }
    if (sent === 0 || level < 2) return;
    const apart = this.enemies.live.filter((e) => e.x !== x || e.y !== y);
    recordCapped(this.throwLog, {
      level,
      boulders: sent,
      distinctTargets: nearestEnemies(this.caster, apart, count, range).length,
    });
  }

  private onOverlap(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const hit = this.struck.get(hitbox);
    // Already struck: the boulder is rolling over the same enemy, not through
    // a new one, so it costs neither damage nor pierce.
    if (!hit || hit.has(enemy)) return;
    hit.add(enemy);

    const { damage, knockback, pierce } = this.stats;
    const push = knockbackVector(hitbox, enemy, knockback, this.caster);
    this.landed += 1;
    this.fx.burst('earth.impact', enemy.x, enemy.y);
    this.damage(enemy, damage, 'hit', hitbox);
    // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
    if (enemy.active) {
      enemy.knockBack(push);
      // The dust is drawn from its top edge, so it sits at the enemy's feet.
      this.fx.burst('earth.dust', enemy.x, enemy.y + enemy.bodyRadius, { flipX: dustFlip(push) });
    }
    if (rollSpent(hit.size, pierce)) this.despawn(hitbox);
  }

  /**
   * Level 3, Landslide: a tile at each `spacingPx` this boulder has rolled, the
   * first at the throw point, laid on the line from there so a long frame leaves
   * an even rut. A tile past `MAX_LIVE_RUT_TILES` is dropped, counted and not
   * retried.
   */
  private layRut(boulder: Projectile, flight: BoulderFlight): void {
    // A long frame can carry it past its range before it despawns: no tile lies beyond the range.
    const travelled = Math.min(boulder.travelled, this.stats.range);
    const due = rutTilesDue(flight.level, travelled, flight.placed + flight.dropped);
    if (due === 0) return;
    // Read now, so a passive taken later grows the next boulder's rut only.
    const tickDamage = this.stats.damage * LANDSLIDE.tickDamageFactor;
    for (let n = 0; n < due; n += 1) {
      const index = flight.placed + flight.dropped;
      if (this.tiles.length >= MAX_LIVE_RUT_TILES) {
        flight.dropped += 1;
        continue;
      }
      const along = index * LANDSLIDE.spacingPx;
      const x = flight.origin.x + flight.dirX * along;
      const y = flight.origin.y + flight.dirY * along;
      const tile: LiveTile = {
        x,
        y,
        dirX: flight.dirX,
        dirY: flight.dirY,
        tickDamage,
        laidAtS: this.clockS,
        sprite: this.drawTile(index, x, y, Math.atan2(flight.dirY, flight.dirX)),
      };
      this.tiles.push(tile);
      flight.placed += 1;
      this.rutLaid += 1;
    }
  }

  /**
   * The sprite for tile number `index`: frame `index % RUT_VARIANTS`, scaled so
   * the band is `widthPx` across and cropped to a `tileLengthPx` window of it (a
   * different window as the numbers climb), turned to the heading, and centred
   * on the tile. Null with no atlas.
   */
  private drawTile(
    index: number,
    x: number,
    y: number,
    heading: number,
  ): Phaser.GameObjects.Sprite | null {
    if (!this.rutGroup.scene.anims.exists(RUT_CLIP)) return null;
    const name = `${RUT_CLIP}.${index % RUT_VARIANTS}` as FrameName;
    const info = FRAMES[name];
    const art = ART_BOXES[RUT_CLIP];
    const scale = LANDSLIDE.widthPx / art.h;
    const windowPx = LANDSLIDE.tileLengthPx / scale;
    const cropX = art.x + rutWindowOffset(index, art.w, windowPx);
    const sprite = this.rutGroup.get(x, y, info.page, name) as Phaser.GameObjects.Sprite | null;
    if (!sprite) return null;
    // The crop keeps the frame's own origin, so the origin is set on the middle of the window.
    sprite
      .setTexture(info.page, name)
      .setActive(true)
      .setVisible(true)
      .setPosition(x, y)
      .setCrop(cropX, art.y, windowPx, art.h)
      .setOrigin((cropX + windowPx / 2) / info.w, (art.y + art.h / 2) / info.h)
      .setRotation(heading)
      .setScale(scale)
      .setAlpha(1);
    return sprite;
  }

  /** Fade every tile by its age and take back the ones that have run out. */
  private ageRut(): void {
    for (let i = this.tiles.length - 1; i >= 0; i -= 1) {
      const tile = this.tiles[i];
      if (!tile) continue;
      const alpha = rutAlpha(this.clockS - tile.laidAtS);
      if (alpha > 0) {
        tile.sprite?.setAlpha(alpha);
        continue;
      }
      if (tile.sprite) this.rutGroup.killAndHide(tile.sprite);
      this.tiles.splice(i, 1);
    }
  }

  /**
   * The one rut clock: it runs while any tile is down and starts again from 0
   * when the ground is bare. Each `tickEveryS` it crosses, every enemy standing
   * on any tile is hit once, for the most any tile under it asks, and staggered.
   */
  private tickRut(deltaS: number): void {
    if (this.tiles.length === 0) {
      this.rutClockS = 0;
      return;
    }
    const due = spawnsDue(this.rutClockS, deltaS, 1 / LANDSLIDE.tickEveryS);
    this.rutClockS += deltaS;
    if (due === 0) return;
    this.rutTickCount += 1;
    const staggerS = rutStaggerS();
    for (const enemy of this.enemies.live) {
      const under = ruttedBy(enemy, this.tiles);
      const first = under[0];
      if (!first) continue;
      if (staggerS > 0) {
        enemy.applyStagger(staggerS);
        this.rutStaggerCount += 1;
      }
      const damage = rutTickDamage(under);
      this.damage(enemy, damage, 'tick', first);
      this.rutHitCount += 1;
      this.rutDamageDealt += damage;
    }
  }

  private despawn(boulder: Projectile): void {
    const flight = this.flights.get(boulder);
    if (flight && flight.level >= 3) {
      recordCapped(this.rutLog, {
        level: flight.level,
        tiles: flight.placed,
        dropped: flight.dropped,
      });
    }
    this.struck.delete(boulder);
    this.flights.delete(boulder);
    boulder.despawn();
  }
}
