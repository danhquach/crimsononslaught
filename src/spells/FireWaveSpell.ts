import Phaser from 'phaser';
import { FIRE_WAVE_ART } from '../config/fireRoster';
import { FRAMES } from '../config/frames';
import { AREA_DEPTH, FX_DEPTH } from '../config/fx';
import {
  MAX_LIVE_WAVES,
  advanceWave,
  newWave,
  waveDone,
  waveHeading,
  waveTarget,
  type Wave,
} from '../core/fireWave';
import { explosionScale } from '../core/fx';
import type { Vec2 } from '../core/input';
import { knockbackVector } from '../core/orbitingBoulders';
import { Spell, anyWithin } from '../core/spell';
import type { FireWaveStats } from '../core/spellStats';
import type { Enemy } from '../entities/Enemy';
import type { EnemyPool } from '../systems/EnemyPool';
import type { FxPool } from '../systems/FxPool';
import type { DamageSink } from './DamageSink';

/** The small burst at each hit, the size Fire Column's hits were drawn at. */
const HIT_BURST_SCALE = explosionScale(22);
/** The rim is drawn no smaller than this, so the first frames of a wave still read. */
const MIN_DRAWN_R = 20;
/** The wave fades out over the last fifth of its range. */
const FADE_FROM = 0.8;
/** Glow inside the slice: a faint orange fill, strongest at the rim. */
const GLOW_COLOR = 0xff6d00;
const GLOW_ALPHA = 0.18;
/** The no-atlas rim: a thick orange front and a thin red edge outside it. */
const RIM_COLOR = 0xffb300;
const RIM_EDGE_COLOR = 0xd50000;
const RIM_WIDTH = 12;
/** The flame front's first frame: every frame of the clip shares its size and page. */
const FRONT = FRAMES['fire.wave.0'];

interface LiveWave {
  wave: Wave<Enemy>;
  /** The glow inside the slice, always drawn. */
  glow: Phaser.GameObjects.Graphics;
  /** The flame front: the `fire.wave` sprite, or a Graphics rim with no atlas. */
  rim: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
}

/**
 * Fire Wave (CO-143, #218; spec §9.2), under the id `fire_column`: every
 * `cooldown` s an `arc`° slice of flame leaves the caster toward the nearest
 * enemy within `range`. Its rim grows at `speed` until it reaches `range`,
 * and every enemy it sweeps over takes `damage`, a `burn` and a `knockback`
 * px shove away from the caster — once per wave.
 *
 * The rules — the target, the slice, the swept band — live in
 * `core/fireWave.ts`. A wave is plain data with no Arcade body (a slice is not
 * an Arcade shape): this class advances it from `tick`, so the run clock
 * drives it and pause and `?timeScale=` just work.
 *
 * Drawn as the `fire.wave` flame front, its origin on the arc's own centre
 * and set on the caster, turned to the heading and scaled so the drawn front
 * is the rim that hits (`FIRE_WAVE_ART`), over a faint Graphics glow. With no
 * atlas the rim is drawn as Graphics strokes instead.
 *
 * FX: `fire.spawn` flashes at the caster as a wave leaves and a small
 * `fire.explode` plays at each hit.
 */
export class FireWaveSpell extends Spell<'fire_column'> {
  private readonly scene: Phaser.Scene;
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly fx: FxPool;
  private readonly waves: LiveWave[] = [];
  /** Test hook (#140): hits this spell has landed, across every wave. */
  private landed = 0;

  constructor(
    scene: Phaser.Scene,
    caster: Readonly<Vec2>,
    enemies: EnemyPool,
    stats: Readonly<FireWaveStats>,
    damage: DamageSink,
    fx: FxPool,
  ) {
    super('fire_column', stats);
    this.scene = scene;
    this.caster = caster;
    this.enemies = enemies;
    this.damage = damage;
    this.fx = fx;
  }

  /** Waves in flight right now. */
  get liveCount(): number {
    return this.waves.length;
  }

  /** Hits this spell has landed, across every wave — what the browser suite watches. */
  get hits(): number {
    return this.landed;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    const { speed, range, arc, damage, burn, burnDuration, knockback } = this.stats;
    const halfArc = ((arc / 2) * Math.PI) / 180;
    for (const live of [...this.waves]) {
      const { wave } = live;
      const struck = advanceWave(
        wave,
        this.enemies.live,
        speed * deltaS,
        range,
        halfArc,
        (enemy) => enemy.bodyRadius,
      );
      for (const enemy of struck) {
        if (!enemy.active) continue;
        this.landed += 1;
        const push = knockbackVector(wave.origin, enemy, knockback, wave.origin);
        this.fx.burst('fire.explode', enemy.x, enemy.y, { scale: HIT_BURST_SCALE });
        // Status before damage, so a killing hit has still marked the enemy.
        enemy.applyBurn(burn, burnDuration);
        this.damage(enemy, damage);
        // A killing blow drops its gems where the enemy stood; only a survivor is shoved.
        if (enemy.active) enemy.knockBack(push);
      }
      if (waveDone(wave, range)) {
        live.glow.destroy();
        live.rim.destroy();
        this.waves.splice(this.waves.indexOf(live), 1);
      } else {
        this.draw(live, halfArc, range);
      }
    }
  }

  /** Nothing within range → the cast waits rather than being spent (#212). */
  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  /** One cast: one wave toward the nearest enemy within `range`, heading locked now. */
  protected cast(): void {
    const target = waveTarget(this.caster, this.enemies.live, this.stats.range);
    // Pool at its cap: the cast is dropped, never queued.
    if (!target || this.waves.length >= MAX_LIVE_WAVES) return;
    const wave = newWave<Enemy>(this.caster, waveHeading(this.caster, target));
    const glow = this.scene.add.graphics().setDepth(AREA_DEPTH);
    const rim = this.scene.anims.exists('fire.wave')
      ? this.scene.add
          .sprite(wave.origin.x, wave.origin.y, FRONT.page, 'fire.wave.0')
          .setOrigin(FIRE_WAVE_ART.tipX / FRONT.w, FIRE_WAVE_ART.tipY / FRONT.h)
          .setRotation(wave.heading)
          .setDepth(FX_DEPTH)
          .play('fire.wave')
      : this.scene.add.graphics().setDepth(FX_DEPTH);
    const live = { wave, glow, rim };
    this.waves.push(live);
    this.draw(live, ((this.stats.arc / 2) * Math.PI) / 180, this.stats.range);
    this.fx.burst('fire.spawn', wave.origin.x, wave.origin.y);
  }

  /** Redraw one wave at its current rim radius. */
  private draw({ wave, glow, rim }: LiveWave, halfArc: number, range: number): void {
    const r = Math.max(MIN_DRAWN_R, wave.r);
    const fade = Phaser.Math.Clamp((range - wave.r) / (range * (1 - FADE_FROM)), 0, 1);
    const { x, y } = wave.origin;
    const from = wave.heading - halfArc;
    const to = wave.heading + halfArc;

    // The glow: a filled slice, no straight-edge strokes, and a brighter band
    // just behind the rim, so it fades toward the caster.
    glow.clear();
    glow.fillStyle(GLOW_COLOR, GLOW_ALPHA * fade);
    glow.slice(x, y, r, from, to, false).fillPath();
    glow.fillStyle(GLOW_COLOR, GLOW_ALPHA * fade);
    glow.beginPath();
    glow.arc(x, y, r, from, to, false);
    glow.arc(x, y, r * 0.6, to, from, true);
    glow.closePath().fillPath();

    if (rim instanceof Phaser.GameObjects.Sprite) {
      rim.setScale(r / FIRE_WAVE_ART.radius).setAlpha(fade);
      return;
    }
    rim.clear();
    rim.lineStyle(RIM_WIDTH, RIM_COLOR, fade);
    rim
      .beginPath()
      .arc(x, y, r - RIM_WIDTH / 2, from, to, false)
      .strokePath();
    rim.lineStyle(3, RIM_EDGE_COLOR, fade);
    rim
      .beginPath()
      .arc(x, y, r + 1, from, to, false)
      .strokePath();
  }
}
