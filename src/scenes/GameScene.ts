import Phaser from 'phaser';
import {
  INVULNERABLE_REGISTRY_KEY,
  LOADOUT_REGISTRY_KEY,
  SCENE,
  TIME_SCALE_REGISTRY_KEY,
  isGamePayload,
  type GamePayload,
  type LevelUpPayload,
  type Outcome,
  type ResultPayload,
} from '../core/scenePayloads';
import { BOSS_EVENT } from '../core/boss';
import { LEVEL_UP_EVENT, resolveLevelUp, type LevelUpPickPayload } from '../core/levelUp';
import { PLAYER_EVENT } from '../core/health';
import { PerkSystem } from '../core/perkSystem';
import { createRng, type Rng } from '../core/rng';
import { RUN_EVENT, type RunEventPayloads } from '../core/runEvents';
import { RunState, clampTimeScale, simulationSteps, type RunFrame } from '../core/runState';
import { spawnPoint } from '../core/spawnDirector';
import type { Spell } from '../core/spell';
import { Spellbook } from '../core/spellbook';
import type {
  EarthStats,
  FireStats,
  IceStats,
  LightningStats,
  PlayerStats,
} from '../core/spellStats';
import { buildLoadout } from '../core/loadout';
import type { RosterSpellId } from '../config/loadout';
import type { SpellStatBlock } from '../config/spellFields';
import { BASE_SPELL_STATS, isSpellId, type SpellId } from '../config/spells';
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
import { FxPool } from '../systems/FxPool';
import { GemPool } from '../systems/GemPool';
import { OverlayPool } from '../systems/OverlayPool';
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
 * and the run's stats — each pick is pushed onto the equipped spells and the
 * generic block onto the player here.
 *
 * The player carries HP and damage intake (CO-021) and enemies chase and damage
 * them on contact (CO-022); HP 0 ends the run as a loss (spec §4 step 4).
 * Deaths drop XP gems that drift in and count XP (CO-023). The spawn director
 * (CO-025) feeds the arena off-camera on the wave schedule. The equipped spells
 * (Epic D) are what kill enemies: Fire (CO-044), Ice (CO-045), Lightning
 * (CO-046) and Earth (CO-047), each on its own cooldown in the run's
 * `Spellbook` (CO-109). The boss (CO-050) is an enemy in the same pool;
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
  /** Spell effects (CO-082): one-shot bursts, and the status overlays that follow enemies. */
  private fx!: FxPool;
  private overlays!: OverlayPool;
  private rng!: Rng;
  private run!: RunState;
  private perks!: PerkSystem;
  /** Every active this run is casting (CO-109), each on its own cooldown. */
  private spells!: Spellbook;
  /** Kept so a spell equipped mid-run can be given the arena's overlaps. */
  private collisions!: CollisionSystem;
  /** Level-ups earned but not yet offered; drained one overlay at a time in `update`. */
  private pendingLevelUps = 0;
  /** `?invulnerable=1` (test hook): contact damage is dropped before it reaches the player. */
  private invulnerable = false;

  constructor() {
    super(SCENE.game);
  }

  /**
   * Test hook (CO-082): status overlays out right now. The browser suite reads
   * it to check nothing is left on a dead enemy; it can never exceed the live
   * enemy count.
   */
  get overlayCount(): number {
    return this.overlays.count;
  }

  /** Test hook: enemies alive in the arena, the bound `overlayCount` must respect. */
  get liveEnemyCount(): number {
    return this.enemies.live.length;
  }

  /** Test hook (CO-109): the actives casting right now, in equip order. */
  get equippedSpellIds(): RosterSpellId[] {
    return this.spells.spells.map((spell) => spell.id);
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
    this.run = new RunState(this.events, this.timeScale());
    // The arena is stepped from `update`, not by Arcade's own clock: every
    // simulation step runs the game logic and then one physics step of the same
    // length (`simulate`), so a scaled run is the same steps, more of them a
    // frame. `disableUpdate` is Phaser's hook for driving `World.update`
    // yourself; without `fixedStep` off it would keep its own 60 Hz accumulator
    // and step zero or two times for one of ours.
    this.physics.disableUpdate();
    this.physics.world.fixedStep = false;
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
    this.fx = new FxPool(this);
    this.overlays = new OverlayPool(this);
    // Every overlap in the run is registered here and nowhere else (CO-032).
    // Its colliders belong to the physics world; the scene keeps the system
    // itself only so a spell equipped mid-run can register its group too.
    this.collisions = new CollisionSystem(this, this.player, this.enemies, this.gems, {
      onEnemyContact: (enemy) => this.onEnemyContact(enemy),
      onGemPickup: (gem) => this.onGemPickup(gem),
    });
    // The four Phase 1 spell ids are also the four element ids (spec §9.1), so
    // the chosen spell is this run's element and its always-equipped default.
    this.spells = new Spellbook(
      buildLoadout(spellId),
      (id, stats) => this.createSpell(id, stats),
      (id) => this.baseStatsFor(id),
    );
    this.equipSpell(spellId);
    for (const extra of this.extraActives()) this.equipSpell(extra);

    const onPick = (pick: LevelUpPickPayload): void => this.applyPick(pick.perkId);
    this.events.on(LEVEL_UP_EVENT.pick, onPick);
    // Spec §4 step 4: the player reaching 0 HP is the losing end of the run.
    const onDied = (): void => this.endRun('lose');
    this.events.once(PLAYER_EVENT.died, onDied);
    // Spec §4 step 4: the boss's death is the win — once its death clip has
    // played (CO-081); the killing blow itself is tallied in `damageEnemy`.
    const onBossDied = (): void => this.endRun('win');
    this.events.once(BOSS_EVENT.died, onBossDied);
    // Spec §4 step 4: the clock turning to the boss phase brings the boss in.
    const onPhase = ({ phase }: RunEventPayloads['phase']): void => {
      if (phase === 'boss') this.spawnBoss();
    };
    this.events.on(RUN_EVENT.phase, onPhase);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(LEVEL_UP_EVENT.pick, onPick);
      this.events.off(PLAYER_EVENT.died, onDied);
      this.events.off(BOSS_EVENT.died, onBossDied);
      this.events.off(RUN_EVENT.phase, onPhase);
    });

    this.scene.launch(SCENE.hud);
  }

  /**
   * The run clock accumulates scene delta, so it freezes with the scene when
   * Game is paused. `RunState.tick` scales that delta (`?timeScale=`) and the
   * frame is simulated over the window it returns, in steps of about a 60 fps
   * frame each (`simulationSteps`), so a scaled run — or a slow machine's long
   * frame — speeds up the arena without coarsening it (#94). A finished run
   * returns a zero-length window and nothing moves.
   */
  update(time: number, delta: number): void {
    if (!this.payload) return;
    // Spec §4 step 3: XP owed from the last pickup is paid before the run moves
    // on. Draining here rather than at pickup is what sequences several levels
    // from one gem: each overlay pauses Game, and the next update after it
    // closes opens the following one.
    if (this.drainLevelUps()) return;
    for (const step of simulationSteps(this.run.tick(delta))) {
      // The step that ends the run (spec §4 step 4) is the frame's last: Result
      // is queued, and nothing after it should move or land a second outcome.
      if (this.run.phase === 'over') break;
      this.simulate(time, step);
    }
  }

  /**
   * One simulation step: the logic decides, Arcade integrates the velocities it
   * set and fires the overlaps, and the sprites are moved to where their bodies
   * ended up so the next step decides from there — Phaser otherwise syncs them
   * once a frame, in `postUpdate`, which is what made a long frame one decision.
   */
  private simulate(time: number, step: RunFrame): void {
    // Spec §4 step 2: the director spends the step's budget before anything
    // moves, so a new enemy chases from the moment it lands.
    this.spawns.update(step.startMs / 1000, step.deltaMs / 1000);
    this.player.update(step.deltaMs);
    this.enemies.update(step.deltaMs, this.player, (enemy, amount) =>
      this.damageEnemy(enemy, amount),
    );
    this.gems.update(step.deltaMs, this.player);
    this.spells.update(step.deltaMs);
    this.physics.world.update(time, step.deltaMs);
    this.physics.world.postUpdate();
    // After the bodies have settled, so an overlay sits on where its host is
    // drawn this frame; one not in the live set — status over, host dead — is freed.
    this.overlays.update(this.enemies.live);
  }

  /**
   * Equip one active mid-run (CO-109). A spell added here starts casting from
   * this moment, on a full cooldown of its own. Which spells a run may be
   * *offered* is the loadout's rule; #132's level-up rework is what calls this.
   */
  equipSpell(spellId: RosterSpellId): boolean {
    return this.spells.equip(spellId) !== undefined;
  }

  /**
   * One spell, built on the pools and collision wiring above. `undefined` for a
   * Phase 2 roster id: those spells land with #140-#143, and equipping one this
   * build cannot cast would leave a dead slot rather than fail loudly.
   */
  private createSpell(spellId: RosterSpellId, stats: SpellStatBlock): Spell | undefined {
    const damage = (enemy: Enemy, amount: number): void => this.damageEnemy(enemy, amount);
    switch (spellId) {
      case 'fire':
        return new FireballSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<FireStats>,
          damage,
          this.fx,
        );
      case 'ice':
        return new FrostNovaSpell(
          this,
          this.player,
          this.enemies,
          stats as Readonly<IceStats>,
          damage,
          this.rng,
          this.fx,
        );
      case 'lightning':
        return new ChainLightningSpell(
          this,
          this.player,
          this.enemies,
          stats as Readonly<LightningStats>,
          damage,
          this.fx,
        );
      case 'earth':
        return new OrbitingBouldersSpell(
          this,
          this.player,
          this.collisions,
          stats as Readonly<EarthStats>,
          damage,
          this.fx,
        );
      default:
        console.warn(`[Game] no implementation for spell "${spellId}" yet`);
        return undefined;
    }
  }

  /**
   * The block a spell's stats are resolved from, before the loadout's passives
   * scale it. The run's perk tree belongs to the chosen spell alone (Phase 1),
   * so that one reads `PerkSystem`'s live block and every other active casts at
   * base values — until #132 retires perks for passives.
   */
  private baseStatsFor(spellId: RosterSpellId): SpellStatBlock | undefined {
    if (!isSpellId(spellId)) return undefined;
    return spellId === this.payload?.spellId ? this.perks.spellStats : BASE_SPELL_STATS[spellId];
  }

  /** `?loadout=` (test hook): extra actives Boot parsed out of the query string. */
  private extraActives(): SpellId[] {
    const extra: unknown = this.registry.get(LOADOUT_REGISTRY_KEY);
    return Array.isArray(extra) ? extra.filter(isSpellId) : [];
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
    const gained = this.gems.collect(gem, this.player);
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
    // The boss's death is the win (spec §5, CO-051), not a gem drop; it lands
    // as `BOSS_EVENT.died` once the boss has finished dying.
    if (!(enemy instanceof Boss)) this.gems.dropFor(enemyType, x, y);
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
    // Every spell reads its block per cast, so the next volley already has it:
    // the perk reaches the spell that owns the tree, and #132's passives will
    // reach all of them through the same call.
    this.spells.refresh();
    this.syncPlayerStats(before);
  }

  /**
   * Push the generic perks onto the player. Move speed and pickup radius are
   * set outright; max HP is granted as the difference — health owns the current
   * HP and the +10 fallback bonus, so it is raised, never overwritten.
   */
  private syncPlayerStats(before: Readonly<PlayerStats>): void {
    const after = this.perks.playerStats;
    this.player.setMoveSpeed(after.moveSpeed);
    this.player.setPickupRadius(after.pickupRadius);
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
