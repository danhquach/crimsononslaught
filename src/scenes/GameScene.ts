import Phaser from 'phaser';
import {
  INVULNERABLE_REGISTRY_KEY,
  LOADOUT_REGISTRY_KEY,
  SAVE_REGISTRY_KEY,
  SCENE,
  TIME_SCALE_REGISTRY_KEY,
  isGamePayload,
  type GamePayload,
  type LevelUpPayload,
  type Outcome,
  type ResultPayload,
} from '../core/scenePayloads';
import { BOSS_EVENT, type BossPhasePayload } from '../core/boss';
import { LOW_HEALTH_RATIO, castSoundFor } from '../config/sounds';
import { audioOf, type Audio } from '../render/audio';
import {
  LEVEL_UP_EVENT,
  resolveLevelUp,
  type LevelUpPickPayload,
  type OfferCard,
} from '../core/levelUp';
import { levelUpOffer, type ActiveCard } from '../core/levelUpOffer';
import { PLAYER_EVENT } from '../core/health';
import { createRng, type Rng } from '../core/rng';
import { RUN_EVENT, emitRunEvent, type RunEventPayloads } from '../core/runEvents';
import { RunState, clampTimeScale, simulationSteps, type RunFrame } from '../core/runState';
import { spawnPoint } from '../core/spawnDirector';
import type { Spell } from '../core/spell';
import { Spellbook } from '../core/spellbook';
import type {
  BoulderStats,
  ChainLightningStats,
  CompanionStats,
  EarthShieldStats,
  GroundAreaStats,
  EarthStats,
  FireColumnStats,
  FireDragonStats,
  FireStats,
  IceShieldStats,
  IceStats,
  LightningStats,
  MeteorStats,
  NovaBombStats,
  SwordStats,
  TornadoStats,
} from '../core/spellStats';
import { buildLoadout } from '../core/loadout';
import { currencyFor, emptySave, isSave, recordRun, serializeSave, type Save } from '../core/save';
import { upgradeRanks } from '../core/upgrades';
import { storeSaveJson } from '../storage/localSave';
import { ROSTER_SPELL_IDS, isRosterSpellId, type RosterSpellId } from '../config/loadout';
import { BASE_PLAYER_PROFILE, isPassiveId, type PlayerProfile } from '../config/passives';
import { AREA_CARDS, AREA_SPELL_IDS, BASE_AREA_STATS, isAreaSpellId } from '../config/areas';
import {
  BASE_STRIKE_STATS,
  STRIKE_CARDS,
  STRIKE_SPELL_IDS,
  isStrikeSpellId,
} from '../config/strikes';
import { ARENA_DEPTH } from '../config/fx';
import type { SpellStatBlock } from '../config/spellFields';
import { BASE_SPELL_STATS, SPELL_CARDS, isSpellId } from '../config/spells';
import {
  BASE_FIRE_ROSTER_STATS,
  FIRE_ROSTER_CARDS,
  FIRE_ROSTER_SPELL_IDS,
  isFireRosterSpellId,
} from '../config/fireRoster';
import {
  BASE_ICE_ROSTER_STATS,
  ICE_ROSTER_CARDS,
  ICE_ROSTER_SPELL_IDS,
  isIceRosterSpellId,
} from '../config/iceRoster';
import {
  BASE_LIGHTNING_ROSTER_STATS,
  LIGHTNING_ROSTER_CARDS,
  LIGHTNING_ROSTER_SPELL_IDS,
  isLightningRosterSpellId,
} from '../config/lightningRoster';
import {
  BASE_COMPANION_STATS,
  COMPANION_CARDS,
  COMPANION_SPELL_IDS,
  isCompanionSpellId,
} from '../config/companions';
import {
  BASE_EARTH_ROSTER_STATS,
  EARTH_ROSTER_CARDS,
  EARTH_ROSTER_SPELL_IDS,
  isEarthRosterSpellId,
} from '../config/earthRoster';
import {
  BASE_SHIELD_STATS,
  SHIELD_CARDS,
  SHIELD_SPELL_IDS,
  isShieldSpellId,
  type ShieldSpellId,
} from '../config/shields';
import { Boss } from '../entities/Boss';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { XpGem } from '../entities/XpGem';
import { ChainLightningSpell } from '../spells/ChainLightningSpell';
import { FireballSpell } from '../spells/FireballSpell';
import { FireColumnSpell } from '../spells/FireColumnSpell';
import { FireDragonSpell } from '../spells/FireDragonSpell';
import { IceArrowSpell } from '../spells/IceArrowSpell';
import { NovaBombSpell } from '../spells/NovaBombSpell';
import { CompanionSpell } from '../spells/CompanionSpell';
import { GroundAreaSpell } from '../spells/GroundAreaSpell';
import { MeteorSpell } from '../spells/MeteorSpell';
import { EarthShieldSpell } from '../spells/EarthShieldSpell';
import { EarthSpikeSpell } from '../spells/EarthSpikeSpell';
import { IceShieldSpell } from '../spells/IceShieldSpell';
import { LightningSwordSpell } from '../spells/LightningSwordSpell';
import { RollingBoulderSpell } from '../spells/RollingBoulderSpell';
import { TornadoSpell } from '../spells/TornadoSpell';
import { ShieldSpell } from '../spells/ShieldSpell';
import { AreaPool } from '../systems/AreaPool';
import { TelegraphPool } from '../systems/TelegraphPool';
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
 * resume, or the empty-offer fallback). `levelUpOffer` (CO-110) draws the
 * cards from the run's loadout: an active while a slot is open, a passive once
 * both are filled. A picked active is equipped into the `Spellbook`; a picked
 * passive lands on the loadout, from where it reaches every equipped spell and
 * the player's own stats here.
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
 *
 * Damage aimed at the player goes through one path — `onEnemyContact` — so the
 * run's defences sit in exactly one place: a shield (#134) absorbs what it can
 * before `Player.takeDamage` sees the rest.
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
  /** Persistent ground areas (#135): every patch on the ground, whichever spell placed it. */
  private areas!: AreaPool;
  /** Sky strikes in the air (#138): every telegraph counting down, whichever spell cast it. */
  private telegraphs!: TelegraphPool;
  private rng!: Rng;
  private run!: RunState;
  /** Every active this run is casting (CO-109), each on its own cooldown. */
  private spells!: Spellbook;
  /** Kept so a spell equipped mid-run can be given the arena's overlaps. */
  private collisions!: CollisionSystem;
  /** Level-ups earned but not yet offered; drained one overlay at a time in `update`. */
  private pendingLevelUps = 0;
  /** The cards the open overlay is showing; a pick is only honoured against these. */
  private offer: readonly OfferCard[] = [];
  /** `?invulnerable=1` (test hook): contact damage is dropped before it reaches the player. */
  private invulnerable = false;
  /** The game's one audio layer (CO-102); every cue in the run goes through it. */
  private audio!: Audio;

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

  /**
   * Test hook (#133): each companion out right now — how far it has strayed
   * from the player, the leash it is held on, and how many attacks it has
   * landed. The browser suite checks the leash holds over a whole run.
   */
  get companionReport(): {
    id: RosterSpellId;
    distance: number;
    leashRadius: number;
    hits: number;
  }[] {
    return this.spells.spells
      .filter((spell): spell is CompanionSpell => spell instanceof CompanionSpell)
      .map((spell) => ({
        id: spell.id,
        distance: Phaser.Math.Distance.Between(
          spell.at.x,
          spell.at.y,
          this.player.x,
          this.player.y,
        ),
        leashRadius: spell.companionStats.leashRadius,
        hits: spell.hits,
      }));
  }

  /**
   * Test hook (#134): each shield equipped right now and what its pool holds.
   * The browser suite watches a real run drain one, break it and see it back.
   */
  get shieldReport(): { id: RosterSpellId; pool: number; max: number; up: boolean }[] {
    return this.shieldSpells().map((spell) => ({
      id: spell.id,
      pool: spell.pool,
      max: spell.maxPool,
      up: spell.up,
    }));
  }

  /**
   * Test hook (#135): the ground areas live right now — how much of their
   * lifetime is left and how far each reaches — plus what the spells casting
   * them have placed and paid out. The browser suite watches a patch appear,
   * tick a crowd and expire.
   */
  get areaReport(): {
    live: { radius: number; remainingS: number }[];
    placed: number;
    hits: number;
  } {
    const spells = this.spells.spells.filter(
      (spell): spell is GroundAreaSpell => spell instanceof GroundAreaSpell,
    );
    return {
      live: this.areas.areas.map((area) => ({ radius: area.radius, remainingS: area.remainingS })),
      placed: spells.reduce((total, spell) => total + spell.placed, 0),
      hits: spells.reduce((total, spell) => total + spell.hits, 0),
    };
  }

  /**
   * Test hook (#138): the strikes in the air right now — how long each has left
   * to fall and how far it will reach — plus what the spells casting them have
   * committed, landed and hit. The browser suite watches a telegraph appear,
   * hold, and land on the crowd.
   */
  get strikeReport(): {
    live: { radius: number; remainingS: number }[];
    committed: number;
    landed: number;
    hits: number;
  } {
    const spells = this.spells.spells.filter(
      (spell): spell is MeteorSpell => spell instanceof MeteorSpell,
    );
    return {
      live: this.telegraphs.telegraphs.map((t) => ({ radius: t.radius, remainingS: t.remainingS })),
      committed: spells.reduce((total, spell) => total + spell.committed, 0),
      landed: spells.reduce((total, spell) => total + spell.landed, 0),
      hits: spells.reduce((total, spell) => total + spell.hits, 0),
    };
  }

  /**
   * Test hook (#140): Fire Column and Fire Dragon, whichever is equipped —
   * hits each has landed and shots each has in the air right now. The browser
   * suite watches a run land hits with both and hold their pool caps.
   */
  get fireReport(): { id: RosterSpellId; hits: number; live: number }[] {
    return this.spells.spells
      .filter(
        (spell): spell is FireColumnSpell | FireDragonSpell =>
          spell instanceof FireColumnSpell || spell instanceof FireDragonSpell,
      )
      .map((spell) => ({ id: spell.id, hits: spell.hits, live: spell.liveCount }));
  }

  /**
   * Test hook (#141): Ice Arrow and Frost Nova Bomb, whichever is equipped —
   * hits each has landed and shots each has in the air right now. The browser
   * suite watches a run land hits with both and hold their pool caps.
   */
  get iceReport(): { id: RosterSpellId; hits: number; live: number }[] {
    return this.spells.spells
      .filter(
        (spell): spell is IceArrowSpell | NovaBombSpell =>
          spell instanceof IceArrowSpell || spell instanceof NovaBombSpell,
      )
      .map((spell) => ({ id: spell.id, hits: spell.hits, live: spell.liveCount }));
  }

  /**
   * Test hook (#142): the Lightning roster, whichever of it is equipped — hits
   * each spell has landed and what each has out right now (bolt strips, live
   * tornadoes, blades on the ring). The browser suite watches a run land hits
   * with every one and hold their pool caps.
   */
  get lightningReport(): { id: RosterSpellId; hits: number; live: number }[] {
    return this.spells.spells
      .filter(
        (spell): spell is ChainLightningSpell | LightningSwordSpell | TornadoSpell =>
          spell instanceof ChainLightningSpell ||
          spell instanceof LightningSwordSpell ||
          spell instanceof TornadoSpell,
      )
      .map((spell) => ({ id: spell.id, hits: spell.hits, live: spell.liveCount }));
  }

  /**
   * Test hook (#143): Earth Spike and Boulder, whichever is equipped — hits
   * each has landed and what each has out right now (the spike is
   * instantaneous, so always none; boulders are what is still rolling). The
   * browser suite watches a run land hits with both and hold the pool cap.
   */
  get earthReport(): { id: RosterSpellId; hits: number; live: number }[] {
    return this.spells.spells
      .filter(
        (spell): spell is EarthSpikeSpell | RollingBoulderSpell =>
          spell instanceof EarthSpikeSpell || spell instanceof RollingBoulderSpell,
      )
      .map((spell) => ({ id: spell.id, hits: spell.hits, live: spell.liveCount }));
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
    this.pendingLevelUps = 0;
    this.offer = [];
    this.invulnerable = this.registry.get(INVULNERABLE_REGISTRY_KEY) === true;
    this.audio = audioOf(this);

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
    this.areas = new AreaPool(this);
    this.telegraphs = new TelegraphPool(this);
    // Every overlap in the run is registered here and nowhere else (CO-032).
    // Its colliders belong to the physics world; the scene keeps the system
    // itself only so a spell equipped mid-run can register its group too.
    this.collisions = new CollisionSystem(this, this.player, this.enemies, this.gems, {
      onEnemyContact: (enemy) => this.onEnemyContact(enemy),
      onGemPickup: (gem) => this.onGemPickup(gem),
    });
    // The four Phase 1 spell ids are also the four element ids (spec §9.1), so
    // the chosen spell is this run's element and its always-equipped default.
    // The save's permanent upgrades go into the loadout before the first cast
    // (CO-101): they resolve with the passives and touch no RNG, so a seed
    // replays the same run for the same save.
    this.spells = new Spellbook(
      buildLoadout(spellId, upgradeRanks(this.save())),
      (id, stats) => this.createSpell(id, stats),
      (id) => this.baseStatsFor(id),
    );
    this.syncPlayerStats(BASE_PLAYER_PROFILE);
    this.equipSpell(spellId);
    for (const extra of this.extraActives()) this.equipSpell(extra);

    const onPick = (pick: LevelUpPickPayload): void => this.applyPick(pick.offerId);
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
    // The boss's wind-up and charge cues (CO-102) follow its cycle events.
    const onBossPhase = ({ phase }: BossPhasePayload): void => {
      if (phase === 'telegraph') this.audio.play('boss.telegraph');
      else if (phase === 'charge') this.audio.play('boss.charge');
    };
    this.events.on(BOSS_EVENT.phase, onBossPhase);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(LEVEL_UP_EVENT.pick, onPick);
      this.events.off(PLAYER_EVENT.died, onDied);
      this.events.off(BOSS_EVENT.died, onBossDied);
      this.events.off(RUN_EVENT.phase, onPhase);
      this.events.off(BOSS_EVENT.phase, onBossPhase);
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
    // Once a frame, like the run clock, and always: the payload is absolute, so
    // a HUD that subscribed late (it is launched from `create`) is right after
    // the first one rather than only after the first hit.
    this.publishShield();
  }

  /**
   * Spec §10: the HUD shows a shield pool when one is equipped. The run's
   * shields are summed, so a `?loadout=` run carrying both reads as the damage
   * it can still soak; `max` 0 is a run with no shield and hides the bar.
   */
  private publishShield(): void {
    let pool = 0;
    let max = 0;
    for (const shield of this.shieldSpells()) {
      pool += shield.pool;
      max += shield.maxPool;
    }
    emitRunEvent(this.events, 'shield', { pool, max });
  }

  /** The shields casting right now, in equip order. */
  private shieldSpells(): ShieldSpell<ShieldSpellId>[] {
    return this.spells.spells.filter(
      (spell): spell is ShieldSpell<ShieldSpellId> => spell instanceof ShieldSpell,
    );
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
    // After the casts, so a patch placed this step starts its lifetime here
    // rather than a step late, and before the physics step, so the enemies a
    // tick slowed move at the speed it just set.
    this.areas.update(step.deltaMs);
    // Same reasoning: a strike telegraphed this step starts falling here, and
    // one that lands here has hit the crowd before the bodies move on.
    this.telegraphs.update(step.deltaMs);
    this.physics.world.update(time, step.deltaMs);
    this.physics.world.postUpdate();
    // After the bodies have settled, so an overlay sits on where its host is
    // drawn this frame; one not in the live set — status over, host dead — is freed.
    this.overlays.update(this.enemies.live);
  }

  /**
   * Cast one more active from this moment on, on a full cooldown of its own
   * (CO-109), without spending a slot: the run's default spell at the start,
   * and the `?loadout=` test hook's extras. A level-up pick goes through
   * `Spellbook.equipActive`, which fills a slot first.
   */
  equipSpell(spellId: RosterSpellId): boolean {
    return this.spells.equip(spellId) !== undefined;
  }

  /**
   * One spell, built on the pools and collision wiring above. Every roster id
   * has a case since #143; `undefined` is left for an id added to the roster
   * without one, so equipping it leaves a dead slot rather than failing loudly.
   */
  private createSpell(spellId: RosterSpellId, stats: SpellStatBlock): Spell | undefined {
    const spell = this.buildSpell(spellId, stats);
    // The cast cue (CO-102) hangs off the spell's own cast hook: one site for
    // every spell, and nothing the spell does waits on it.
    const cue = castSoundFor(spellId);
    if (spell && cue) spell.onCast = () => this.audio.play(cue);
    return spell;
  }

  private buildSpell(spellId: RosterSpellId, stats: SpellStatBlock): Spell | undefined {
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
        return new IceArrowSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<IceStats>,
          damage,
          this.fx,
        );
      case 'ice_nova_bomb':
        return new NovaBombSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<NovaBombStats>,
          damage,
          this.rng,
          this.fx,
        );
      case 'lightning':
      case 'lightning_chain':
        return new ChainLightningSpell(
          this,
          spellId,
          this.player,
          this.enemies,
          stats as Readonly<LightningStats | ChainLightningStats>,
          damage,
          this.rng,
          this.fx,
        );
      case 'lightning_tornado':
        return new TornadoSpell(
          this.player,
          this.enemies,
          stats as Readonly<TornadoStats>,
          damage,
          this.areas,
        );
      case 'lightning_sword':
        return new LightningSwordSpell(
          this,
          this.player,
          this.collisions,
          stats as Readonly<SwordStats>,
          damage,
          this.fx,
        );
      case 'earth':
        return new EarthSpikeSpell(
          this.player,
          this.enemies,
          stats as Readonly<EarthStats>,
          damage,
          this.fx,
        );
      case 'earth_boulder':
        return new RollingBoulderSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<BoulderStats>,
          damage,
          this.fx,
        );
      case 'fire_companion':
      case 'ice_companion':
      case 'lightning_companion':
      case 'earth_companion':
        return new CompanionSpell(
          this,
          spellId,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<CompanionStats>,
          damage,
          this.fx,
        );
      case 'ice_shield':
        return new IceShieldSpell(
          this,
          this.player,
          this.enemies,
          stats as Readonly<IceShieldStats>,
          damage,
          this.fx,
        );
      case 'ice_blizzard':
      case 'earth_quake':
        return new GroundAreaSpell(
          spellId,
          this.player,
          this.enemies,
          stats as Readonly<GroundAreaStats>,
          damage,
          this.areas,
          this.rng,
        );
      case 'fire_column':
        return new FireColumnSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<FireColumnStats>,
          damage,
          this.fx,
        );
      case 'fire_dragon':
        return new FireDragonSpell(
          this,
          this.player,
          this.enemies,
          this.collisions,
          stats as Readonly<FireDragonStats>,
          damage,
          this.fx,
        );
      case 'fire_meteor':
        return new MeteorSpell(
          spellId,
          this.player,
          this.enemies,
          stats as Readonly<MeteorStats>,
          damage,
          this.telegraphs,
          this.fx,
          this.rng,
        );
      case 'earth_shield':
        return new EarthShieldSpell(
          this,
          this.player,
          this.collisions,
          stats as Readonly<EarthShieldStats>,
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
   * scale it (spec §6.2). Every roster spell has a block since #143;
   * `undefined` is left for an id added to the roster without one, which
   * `activeCatalog` then keeps out of the offers.
   */
  private baseStatsFor(spellId: RosterSpellId): SpellStatBlock | undefined {
    if (isSpellId(spellId)) return BASE_SPELL_STATS[spellId];
    if (isCompanionSpellId(spellId)) return BASE_COMPANION_STATS[spellId];
    if (isShieldSpellId(spellId)) return BASE_SHIELD_STATS[spellId];
    if (isAreaSpellId(spellId)) return BASE_AREA_STATS[spellId];
    if (isStrikeSpellId(spellId)) return BASE_STRIKE_STATS[spellId];
    if (isFireRosterSpellId(spellId)) return BASE_FIRE_ROSTER_STATS[spellId];
    if (isIceRosterSpellId(spellId)) return BASE_ICE_ROSTER_STATS[spellId];
    if (isLightningRosterSpellId(spellId)) return BASE_LIGHTNING_ROSTER_STATS[spellId];
    if (isEarthRosterSpellId(spellId)) return BASE_EARTH_ROSTER_STATS[spellId];
    return undefined;
  }

  /**
   * Every active this build can actually cast and is not already casting, as a
   * level-up card reads it: the whole Phase 2 roster, twenty spells over four
   * elements, complete since #143. `canEquip` is what keeps an offer to the
   * run's own element; this list only says what exists.
   *
   * What is already casting is filtered out here rather than by `canEquip`,
   * because `?loadout=` puts a spell on the board without spending a slot
   * (CO-109): the loadout would still count it offerable and the pick would be
   * dropped at `equipActive`, costing the level-up for nothing.
   */
  private activeCatalog(): ActiveCard[] {
    const casting = new Set<string>(this.equippedSpellIds);
    return [
      ...ROSTER_SPELL_IDS.filter(isSpellId).map((id) => ({
        id,
        name: SPELL_CARDS[id].name,
        description: SPELL_CARDS[id].description,
      })),
      ...COMPANION_SPELL_IDS.map((id) => ({
        id,
        name: COMPANION_CARDS[id].name,
        description: COMPANION_CARDS[id].description,
      })),
      ...SHIELD_SPELL_IDS.map((id) => ({
        id,
        name: SHIELD_CARDS[id].name,
        description: SHIELD_CARDS[id].description,
      })),
      ...AREA_SPELL_IDS.map((id) => ({
        id,
        name: AREA_CARDS[id].name,
        description: AREA_CARDS[id].description,
      })),
      ...STRIKE_SPELL_IDS.map((id) => ({
        id,
        name: STRIKE_CARDS[id].name,
        description: STRIKE_CARDS[id].description,
      })),
      ...FIRE_ROSTER_SPELL_IDS.map((id) => ({
        id,
        name: FIRE_ROSTER_CARDS[id].name,
        description: FIRE_ROSTER_CARDS[id].description,
      })),
      ...ICE_ROSTER_SPELL_IDS.map((id) => ({
        id,
        name: ICE_ROSTER_CARDS[id].name,
        description: ICE_ROSTER_CARDS[id].description,
      })),
      ...LIGHTNING_ROSTER_SPELL_IDS.map((id) => ({
        id,
        name: LIGHTNING_ROSTER_CARDS[id].name,
        description: LIGHTNING_ROSTER_CARDS[id].description,
      })),
      ...EARTH_ROSTER_SPELL_IDS.map((id) => ({
        id,
        name: EARTH_ROSTER_CARDS[id].name,
        description: EARTH_ROSTER_CARDS[id].description,
      })),
    ].filter((card) => !casting.has(card.id));
  }

  /** The save Boot parsed into the registry; an empty one if something else got there first. */
  private save(): Save {
    const stored: unknown = this.registry.get(SAVE_REGISTRY_KEY);
    return isSave(stored) ? stored : emptySave();
  }

  /** `?loadout=` (test hook): extra actives Boot parsed out of the query string. */
  private extraActives(): RosterSpellId[] {
    const extra: unknown = this.registry.get(LOADOUT_REGISTRY_KEY);
    return Array.isArray(extra) ? extra.filter(isRosterSpellId) : [];
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
    // A hit the player is still immune to costs nothing: `core/health.ts` would
    // swallow it, so a shield must not pay for it out of its pool either.
    //
    // Not a defensive check — the window it guards is reachable. The hit that
    // opens the 0.5 s window is one the shields could not fully absorb, so they
    // are empty as it lands; but a shield whose recharge delay was almost up
    // refills inside that window, and the next contact would then shatter a
    // shield holding a point or two and re-arm its whole delay, for a hit the
    // player never felt.
    if (this.player.immune) return;
    const throughShields = this.absorbOnShields(enemy.contactDamage);
    if (throughShields <= 0) return;
    const before = this.player.hp;
    this.player.takeDamage(throughShields);
    // Cues (CO-102) read the outcome; they never decide it. The death cue
    // plays on the killing hit rather than at the end of the death clip.
    const hp = this.player.hp;
    if (hp >= before) return;
    if (hp <= 0) this.audio.play('player.death');
    else {
      this.audio.play('player.hurt');
      if (hp <= this.player.maxHp * LOW_HEALTH_RATIO) this.audio.play('player.lowHealth');
    }
  }

  /**
   * Put a hit through the run's shields and return what is left for the
   * player's HP (#134, spec §9.3: a shield absorbs before `damageReduction`,
   * which `core/health.ts` applies to what passes through — #139).
   *
   * Each shield takes what it can in equip order, so a run carrying two of them
   * — only the `?loadout=` hook can, an element owns one — spends the first
   * before the second rather than splitting the hit between them.
   */
  private absorbOnShields(amount: number): number {
    let left = amount;
    for (const shield of this.shieldSpells()) {
      if (left <= 0) break;
      left = shield.absorbDamage(left);
    }
    return left;
  }

  /** Spec §5: a gem is XP on touch; the drop itself is handled where the enemy dies. */
  private onGemPickup(gem: XpGem): void {
    const gained = this.gems.collect(gem, this.player);
    if (gained === 0) return;
    this.audio.play('progress.gem');
    // Avarice multiplies what a gem is worth as it is collected (spec §6.2), so
    // the gem keeps its face value everywhere else. The XP curve carries the
    // fraction: rounding a 1 XP gem would throw every Avarice rank away.
    this.pendingLevelUps += this.run.addXp(gained * this.spells.profile.xpGain);
  }

  /**
   * Every point of damage an enemy takes comes through here — spell hits and
   * burn ticks alike — so a death is tallied and drops its gems where the
   * enemy fell (spec §5: 1, or 3 for a tank) whatever killed it.
   */
  private damageEnemy(enemy: Enemy, amount: number): void {
    if (!enemy.active) return;
    const { x, y, enemyType } = enemy;
    const boss = enemy instanceof Boss;
    if (!enemy.takeDamage(amount)) {
      this.audio.play('enemy.hurt');
      return;
    }
    this.run.recordKill();
    // The boss's death is the win (spec §5, CO-051), not a gem drop; it lands
    // as `BOSS_EVENT.died` once the boss has finished dying. Its death cue
    // plays on the killing blow, with the clip, not after it.
    this.audio.play(boss ? 'boss.death' : 'enemy.death');
    if (!boss) this.gems.dropFor(enemyType, x, y);
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
    this.audio.play('boss.spawn');
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
    // Under everything the run puts on the floor, so a ground area (#135) lies
    // on the arena rather than beneath it.
    this.add
      .grid(cx, cy, WORLD_WIDTH, WORLD_HEIGHT, GRID_CELL, GRID_CELL, ARENA_FILL, 1, ARENA_LINE, 1)
      .setDepth(ARENA_DEPTH);
    this.add
      .rectangle(cx, cy, WORLD_WIDTH, WORLD_HEIGHT)
      .setStrokeStyle(6, ARENA_BORDER)
      .setDepth(ARENA_DEPTH);
  }

  /**
   * Pay out the level-ups owed, in order, until one of them opens the overlay.
   * Returns true when it did — Game is paused and this frame is over.
   *
   * One pickup can owe several: `RunState` settles the level once and reports
   * how many were crossed, so every overlay in the batch is offered at the
   * level the run has reached. A burst that crosses a slot's unlock level
   * therefore pays out that slot on the batch's first card rather than holding
   * it back for a level the run is already past.
   */
  private drainLevelUps(): boolean {
    while (this.pendingLevelUps > 0) {
      this.pendingLevelUps -= 1;
      if (this.openLevelUp()) return true;
    }
    return false;
  }

  /**
   * Spec §7.1: pause and offer up to 3 cards — actives while a slot is open,
   * passives once both are filled; with nothing eligible grant +10 max HP
   * silently and keep running.
   *
   * Returns whether the overlay was launched (and Game paused).
   */
  private openLevelUp(): boolean {
    const offer = levelUpOffer(this.rng, {
      loadout: this.spells.loadout,
      level: this.run.level,
      actives: this.activeCatalog(),
    });
    const resolution = resolveLevelUp(offer);
    if (resolution.kind === 'fallback') {
      this.player.grantMaxHp(resolution.maxHpBonus);
      return false;
    }
    this.offer = resolution.cards;
    const payload: LevelUpPayload = { offer: resolution.cards };
    this.audio.play('progress.levelUp');
    this.scene.pause();
    this.scene.launch(SCENE.levelUp, payload);
    return true;
  }

  /**
   * Take the pick the overlay sent. Only a card from the offer that is still
   * open counts, so a stray or out-of-date pick is logged and dropped rather
   * than granting something this run was never shown.
   */
  private applyPick(offerId: string): void {
    const card = this.offer.find((c) => c.id === offerId);
    this.offer = [];
    if (!card) {
      console.warn(`[Game] ignoring pick of unoffered card "${offerId}"`);
      return;
    }
    const taken = card.kind === 'active' ? this.equipActive(card.id) : this.takePassive(card.id);
    if (!taken) return;
    this.audio.play('progress.perk');
    // `RunStats.perks` carries display names; Result collapses repeats to `name ×n`.
    this.run.recordPerk(card.name);
  }

  /** A picked active fills the lowest open slot and starts casting (spec §3.1). */
  private equipActive(spellId: string): boolean {
    if (!isRosterSpellId(spellId)) return false;
    if (this.spells.equipActive(spellId, this.run.level) === undefined) {
      console.warn(`[Game] could not equip "${spellId}"`);
      return false;
    }
    return true;
  }

  /**
   * A picked passive lands on the loadout, which re-resolves every equipped
   * spell's block (spec §4.2, §6.2); what the profile changes on the player
   * itself is pushed across here.
   */
  private takePassive(passiveId: string): boolean {
    if (!isPassiveId(passiveId)) return false;
    const before = this.spells.profile;
    this.spells.takePassive(passiveId);
    this.syncPlayerStats(before);
    return true;
  }

  /**
   * Push the profile's player-side fields onto the player. Move speed and
   * pickup radius are set outright; max HP is granted as the difference —
   * health owns the current HP and the +10 fallback bonus, so it is raised,
   * never overwritten — and it heals for what it added, which is what makes a
   * Vitality taken mid-fight worth something (spec §5).
   */
  private syncPlayerStats(before: Readonly<PlayerProfile>): void {
    const after = this.spells.profile;
    this.player.setMoveSpeed(after.moveSpeed);
    this.player.setPickupRadius(after.pickupRadius);
    this.player.setHpRegen(after.hpRegen);
    this.player.setDamageReduction(after.damageReduction);
    if (after.maxHp !== before.maxHp) this.player.grantMaxHp(after.maxHp - before.maxHp, true);
  }

  /**
   * Spec §4 step 4. The first outcome stands: a frame in which the boss's last
   * hit and the player's death both land must not start Result twice.
   */
  private endRun(outcome: Outcome): void {
    if (!this.payload || this.run.phase === 'over') return;
    this.run.end();
    const stats = this.run.stats(this.payload.spellId);
    // The one write per run (CO-101): fold the stats and the payout into the
    // save, hand the new save to the registry and to storage, and tell Result
    // what it paid. A failed store is logged, never thrown: the run has ended.
    const earned = currencyFor(stats, outcome);
    const save = recordRun(this.save(), stats, outcome, earned);
    this.registry.set(SAVE_REGISTRY_KEY, save);
    if (!storeSaveJson(serializeSave(save))) console.warn('[save] could not store progress');
    const payload: ResultPayload = { outcome, stats, earned, balance: save.currency };
    // The HUD is a parallel scene; stopping Game does not stop it.
    this.scene.stop(SCENE.hud);
    this.scene.start(SCENE.result, payload);
  }
}
