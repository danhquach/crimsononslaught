import Phaser from 'phaser';
import {
  INVULNERABLE_REGISTRY_KEY,
  SCENE,
  TIME_SCALE_REGISTRY_KEY,
  isGamePayload,
  type GamePayload,
  type LevelUpPayload,
  type Outcome,
  type ResultPayload,
} from '../core/scenePayloads';
import { LEVEL_UP_EVENT, resolveLevelUp, type LevelUpPickPayload } from '../core/levelUp';
import { PLAYER_EVENT } from '../core/health';
import { PerkSystem } from '../core/perkSystem';
import { createRng, type Rng } from '../core/rng';
import { RUN_EVENT, type RunEventPayloads } from '../core/runEvents';
import { RunState, clampTimeScale } from '../core/runState';
import { spawnPoint } from '../core/spawnDirector';
import type { Spell } from '../core/spell';
import type {
  EarthStats,
  FireStats,
  IceStats,
  LightningStats,
  PlayerStats,
} from '../core/spellStats';
import type { SpellId } from '../config/spells';
import { Boss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { XpGem } from '../entities/XpGem';
import { ChainLightningSpell } from '../spells/ChainLightningSpell';
import { FireballSpell } from '../spells/FireballSpell';
import { FrostNovaSpell } from '../spells/FrostNovaSpell';
import { OrbitingBouldersSpell } from '../spells/OrbitingBouldersSpell';
import { CollisionSystem } from '../systems/CollisionSystem';
import { EnemyPool } from '../systems/EnemyPool';
import { GemPool } from '../systems/GemPool';
import { SpawnDirector } from '../systems/SpawnDirector';

/** Arena size in pixels (spec §9). Bounded: the camera and the player stop at the edge. */
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

const ARENA_FILL = 0x121212;
const ARENA_LINE = 0x1f1f1f;
const ARENA_BORDER = 0x5a1620;
const GRID_CELL = 200;

/**
 * The run: a 3000 x 3000 bounded arena with the player at its centre and the
 * camera following inside the same bounds. Nothing but the HUD is drawn over
 * it — the run's seed is reachable from the boot log (`[rng] seed=`).
 *
 * The run clock is emitted on `this.events` (see `core/runEvents.ts`) so the
 * HUD is live. Collected XP levels the run on spec §5's curve (CO-031) and
 * each level drives the level-up flow (pause -> LevelUp overlay -> pick ->
 * resume, or the zero-perk fallback). `PerkSystem` (CO-042) owns the offers
 * and the run's stats — each pick is pushed onto the live spell and the
 * generic block onto the player here.
 *
 * The player carries HP and damage intake (CO-021) and enemies chase and damage
 * them on contact (CO-022); HP 0 ends the run as a loss (spec §4 step 4).
 * Deaths drop XP gems that drift in and count XP (CO-023). The spawn director
 * (CO-025) feeds the arena off-camera on the wave schedule. The chosen spell
 * (Epic D) is what kills enemies: Fire (CO-044), Ice (CO-045), Lightning
 * (CO-046) and Earth (CO-047). The boss (CO-050) is an enemy in the same pool;
 * the boss phase (CO-051) spawns it off-camera at 5:00, the wave table has
 * stopped regular spawns by then, and its death is the win (spec §4 step 4).
 * `RunState` (CO-030) owns the clock, the phase and the tallies behind those
 * events, and `CollisionSystem` (CO-032) owns every overlap in the arena,
 * spell hitboxes included.
 */
export class GameScene extends Phaser.Scene {
  private payload: GamePayload | null = null;
  private player!: Player;
  private enemies!: EnemyPool;
  private spawns!: SpawnDirector;
  private gems!: GemPool;
  private rng!: Rng;
  private run!: RunState;
  private perks!: PerkSystem;
  /** The run's one spell (Epic D), built from the payload's id in `create`. */
  private spell!: Spell;
  /** Level-ups earned but not yet offered; drained one overlay at a time in `update`. */
  private pendingLevelUps = 0;
  /** `?invulnerable=1` (test hook): contact damage is dropped before it reaches the player. */
  private invulnerable = false;

  constructor() {
    super(SCENE.game);
  }

  init(data: unknown): void {
    this.payload = isGamePayload(data) ? data : null;
    // Phaser keeps the last `start(key, data)` payload in settings.data and
    // replays it when the scene is later started with no data. Clear it so
    // a payload-less start is seen as missing every time, not just the first.
    this.scene.settings.data = {};
  }

  create(): void {
    // A full payload is required (spec §7). Without one there is no run to play.
    if (!this.payload) {
      console.warn('[Game] started without a valid payload; returning to SpellSelect');
      this.scene.start(SCENE.spellSelect);
      return;
    }
    const { spellId, seed } = this.payload;
    this.rng = createRng(seed);
    const timeScale = this.timeScale();
    this.run = new RunState(this.events, timeScale);
    // Arcade integrates velocities against real time, so the test hook has to
    // reach the physics world too or a scaled run would speed up the clock
    // while the arena crawled. Phaser reads its scale inversely: 0.5 = double.
    this.physics.world.timeScale = 1 / timeScale;
    this.perks = new PerkSystem(spellId, this.rng);
    this.pendingLevelUps = 0;
    this.invulnerable = this.registry.get(INVULNERABLE_REGISTRY_KEY) === true;

    this.buildArena();
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.cameras.main.startFollow(this.player, true);

    this.enemies = new EnemyPool(this);
    this.spawns = new SpawnDirector(this.cameras.main, this.enemies, this.rng, {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
    });
    this.gems = new GemPool(this);
    // Every overlap in the run is registered here and nowhere else (CO-032).
    // Its colliders belong to the physics world, so nothing holds the system
    // past handing the spell its group.
    const collisions = new CollisionSystem(this, this.player, this.enemies, this.gems, {
      onEnemyContact: (enemy) => this.onEnemyContact(enemy),
      onGemPickup: (gem) => this.onGemPickup(gem),
    });
    this.spell = this.createSpell(spellId, collisions);

    const onPick = (pick: LevelUpPickPayload): void => this.applyPick(pick.perkId);
    this.events.on(LEVEL_UP_EVENT.pick, onPick);
    // Spec §4 step 4: the player reaching 0 HP is the losing end of the run.
    const onDied = (): void => this.endRun('lose');
    this.events.once(PLAYER_EVENT.died, onDied);
    // Spec §4 step 4: the clock turning to the boss phase brings the boss in.
    const onPhase = ({ phase }: RunEventPayloads['phase']): void => {
      if (phase === 'boss') this.spawnBoss();
    };
    this.events.on(RUN_EVENT.phase, onPhase);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(LEVEL_UP_EVENT.pick, onPick);
      this.events.off(PLAYER_EVENT.died, onDied);
      this.events.off(RUN_EVENT.phase, onPhase);
    });

    this.scene.launch(SCENE.hud);
  }

  /**
   * The run clock accumulates scene delta, so it freezes with the scene when
   * Game is paused. `RunState.tick` scales that delta (`?timeScale=`) and the
   * whole frame is simulated over the window it returns, so a scaled run speeds
   * up the arena and not just the timer. A finished run returns a zero-length
   * window and nothing moves.
   */
  update(_time: number, delta: number): void {
    if (!this.payload) return;
    // Spec §4 step 3: XP owed from the last pickup is paid before the run moves
    // on. Draining here rather than at pickup is what sequences several levels
    // from one gem: each overlay pauses Game, and the next update after it
    // closes opens the following one.
    if (this.drainLevelUps()) return;
    const frame = this.run.tick(delta);
    if (frame.deltaMs === 0) return;
    // Spec §4 step 2: the director spends the frame's budget before anything
    // moves, so a new enemy chases from the moment it lands.
    this.spawns.update(frame.startMs / 1000, frame.deltaMs / 1000);
    this.player.update(frame.deltaMs);
    this.enemies.update(frame.deltaMs, this.player, (enemy, amount) =>
      this.damageEnemy(enemy, amount),
    );
    this.gems.update(this.player, this.perks.playerStats.pickupRadius);
    this.spell.update(frame.deltaMs);
  }

  /** The run's spell, built on the pool and collision wiring above. */
  private createSpell(spellId: SpellId, collisions: CollisionSystem): Spell {
    const damage = (enemy: Enemy, amount: number): void => this.damageEnemy(enemy, amount);
    // `PerkSystem` was built from the same id, so its block is this spell's.
    switch (spellId) {
      case 'fire': {
        const stats = this.perks.spellStats as Readonly<FireStats>;
        return new FireballSpell(this, this.player, this.enemies, collisions, stats, damage);
      }
      case 'ice': {
        const stats = this.perks.spellStats as Readonly<IceStats>;
        return new FrostNovaSpell(this, this.player, this.enemies, stats, damage, this.rng);
      }
      case 'lightning': {
        const stats = this.perks.spellStats as Readonly<LightningStats>;
        return new ChainLightningSpell(this, this.player, this.enemies, stats, damage);
      }
      case 'earth': {
        const stats = this.perks.spellStats as Readonly<EarthStats>;
        return new OrbitingBouldersSpell(this, this.player, collisions, stats, damage);
      }
    }
  }

  /** `?timeScale=` is resolved once in Boot; a Game started without it runs real time. */
  private timeScale(): number {
    return clampTimeScale(this.registry.get(TIME_SCALE_REGISTRY_KEY));
  }

  /**
   * Spec §5: each enemy damages the player at most once per 0.5 s. The player's
   * own invulnerability window (CO-021) gates the damage on top of that.
   */
  private onEnemyContact(enemy: Enemy): void {
    if (!enemy.active || this.invulnerable) return;
    if (!enemy.tryContact()) return;
    this.player.takeDamage(enemy.contactDamage);
  }

  /** Spec §5: a gem is XP on touch; the drop itself is handled where the enemy dies. */
  private onGemPickup(gem: XpGem): void {
    const gained = this.gems.collect(gem);
    if (gained === 0) return;
    this.pendingLevelUps += this.run.addXp(gained);
  }

  /**
   * Every point of damage an enemy takes comes through here — spell hits and
   * burn ticks alike — so a death is tallied and drops its gems where the
   * enemy fell (spec §5: 1, or 3 for a tank) whatever killed it.
   */
  private damageEnemy(enemy: Enemy, amount: number): void {
    if (!enemy.active) return;
    const { x, y, enemyType } = enemy;
    if (!enemy.takeDamage(amount)) return;
    this.run.recordKill();
    // The boss's death is the win (spec §5, CO-051), not a gem drop.
    if (enemy instanceof Boss) this.endRun('win');
    else this.gems.dropFor(enemyType, x, y);
  }

  /**
   * Boss phase (CO-051): the boss lands on the same off-camera ring regular
   * spawns use, at a seeded angle, so where it walks in from is fixed per seed.
   */
  private spawnBoss(): void {
    const view = this.cameras.main.worldView;
    const point = spawnPoint(
      { x: view.centerX, y: view.centerY },
      { width: view.width, height: view.height },
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      this.rng.next() * Math.PI * 2,
    );
    this.enemies.spawnBoss(point.x, point.y);
  }

  /**
   * Bounded world: Arcade bounds stop the player at the edge, camera bounds stop
   * the view there. The grid gives the empty plane enough texture to read motion.
   */
  private buildArena(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    this.add.grid(
      cx,
      cy,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      GRID_CELL,
      GRID_CELL,
      ARENA_FILL,
      1,
      ARENA_LINE,
      1,
    );
    this.add.rectangle(cx, cy, WORLD_WIDTH, WORLD_HEIGHT).setStrokeStyle(6, ARENA_BORDER);
  }

  /**
   * Pay out the level-ups owed, in order, until one of them opens the overlay.
   * Returns true when it did — Game is paused and this frame is over.
   */
  private drainLevelUps(): boolean {
    while (this.pendingLevelUps > 0) {
      this.pendingLevelUps -= 1;
      if (this.openLevelUp()) return true;
    }
    return false;
  }

  /**
   * Spec §5: pause and offer up to 3 eligible perks; with none eligible grant
   * +10 max HP silently and keep running.
   *
   * Returns whether the overlay was launched (and Game paused).
   */
  private openLevelUp(): boolean {
    const resolution = resolveLevelUp(this.perks.offer());
    if (resolution.kind === 'fallback') {
      this.player.grantMaxHp(resolution.maxHpBonus);
      return false;
    }
    const payload: LevelUpPayload = { offer: resolution.cards };
    this.scene.pause();
    this.scene.launch(SCENE.levelUp, payload);
    return true;
  }

  /**
   * Take the pick the overlay sent. `PerkSystem` refuses anything this run
   * cannot take, so an out-of-date or stray pick is logged and dropped.
   */
  private applyPick(perkId: string): void {
    const before = this.perks.playerStats;
    const card = this.perks.pick(perkId);
    if (!card) {
      console.warn(`[Game] ignoring pick of unavailable perk "${perkId}"`);
      return;
    }
    // `RunStats.perks` carries display names; Result collapses repeats to `name ×n`.
    this.run.recordPerk(card.name);
    // The spell reads its block per cast, so the next volley already has the perk.
    this.spell.setStats(this.perks.spellStats);
    this.syncPlayerStats(before);
  }

  /**
   * Push the generic perks onto the player. Move speed is set outright, max HP
   * is granted as the difference — health owns the current HP and the +10
   * fallback bonus, so it is raised, never overwritten. The pickup radius is
   * read straight from the stats each frame in `update`.
   */
  private syncPlayerStats(before: Readonly<PlayerStats>): void {
    const after = this.perks.playerStats;
    this.player.speed = after.moveSpeed;
    if (after.maxHp !== before.maxHp) this.player.grantMaxHp(after.maxHp - before.maxHp);
  }

  /**
   * Spec §4 step 4. The first outcome stands: a frame in which the boss's last
   * hit and the player's death both land must not start Result twice.
   */
  private endRun(outcome: Outcome): void {
    if (!this.payload || this.run.phase === 'over') return;
    this.run.end();
    const payload: ResultPayload = { outcome, stats: this.run.stats(this.payload.spellId) };
    // The HUD is a parallel scene; stopping Game does not stop it.
    this.scene.stop(SCENE.hud);
    this.scene.start(SCENE.result, payload);
  }
}
