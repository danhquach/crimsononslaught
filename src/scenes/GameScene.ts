import Phaser from 'phaser';
import {
  SCENE,
  TIME_SCALE_REGISTRY_KEY,
  isGamePayload,
  type GamePayload,
  type LevelUpPayload,
  type Outcome,
  type ResultPayload,
} from '../core/scenePayloads';
import {
  LEVEL_UP_EVENT,
  resolveLevelUp,
  type LevelUpPickPayload,
  type PerkCard,
} from '../core/levelUp';
import { PLAYER_EVENT } from '../core/health';
import { createRng, type Rng } from '../core/rng';
import { RunState, clampTimeScale } from '../core/runState';
import { MAX_LIVE_ENEMIES } from '../config/enemies';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { XpGem } from '../entities/XpGem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { EnemyPool } from '../systems/EnemyPool';
import { GemPool } from '../systems/GemPool';
import { SpawnDirector } from '../systems/SpawnDirector';
import { addTextButton } from './ui';

/** Arena size in pixels (spec §9). Bounded: the camera and the player stop at the edge. */
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

const ARENA_FILL = 0x121212;
const ARENA_LINE = 0x1f1f1f;
const ARENA_BORDER = 0x5a1620;
const GRID_CELL = 200;
/** Stub buttons and labels sit above the world and ignore the camera scroll. */
const UI_DEPTH = 10;

/** Debug kill button: more than any archetype's HP, so one hit always kills. */
const DEBUG_KILL_DAMAGE = 9999;

/**
 * Stand-in perk pool until the real trees (CO-040) and offer logic (CO-041)
 * land: six ranks in total, so a few debug level-ups exhaust it and exercise
 * the 3 / 2 / 1 / 0-card paths, including the silent +10 max HP fallback.
 */
const STUB_PERKS: readonly Omit<PerkCard, 'rank'>[] = [
  {
    id: 'stub.power.damage',
    name: 'Sharper Edge',
    branch: 'Power',
    maxRank: 2,
    description: '+20% damage per rank.',
  },
  {
    id: 'stub.reach.radius',
    name: 'Wider Reach',
    branch: 'Reach',
    maxRank: 1,
    description: '+15% area of effect.',
  },
  {
    id: 'stub.utility.cooldown',
    name: 'Quick Cast',
    branch: 'Utility',
    maxRank: 2,
    description: '-10% cooldown per rank.',
  },
  {
    id: 'stub.generic.speed',
    name: 'Move Speed',
    branch: 'Generic',
    maxRank: 1,
    description: '+10% move speed.',
  },
];

/**
 * The run: a 3000 x 3000 bounded arena with the player at its centre and the
 * camera following inside the same bounds.
 *
 * Still stubbed around that: Win / Lose buttons end the run with a full
 * `ResultPayload`, and the run clock is emitted on `this.events` (see
 * `core/runEvents.ts`) so the HUD is live. Collected XP levels the run on spec
 * §5's curve (CO-031) and each level drives the level-up flow (pause -> LevelUp
 * overlay -> pick -> resume, or the zero-perk fallback) from a stub perk pool
 * until CO-042 brings the real trees; "Level up" just grants the XP for one.
 * The player carries HP and damage intake (CO-021) and enemies chase and damage
 * them on contact (CO-022); HP 0 ends the run as a loss (spec §4 step 4).
 * Deaths drop XP gems that drift in and count XP (CO-023). The spawn director
 * (CO-025) feeds the arena off-camera on the wave schedule; "Kill all" stands
 * in for spells (Epic D), which are what will kill enemies in a real run.
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
  private debugText!: Phaser.GameObjects.Text;
  private rng!: Rng;
  private run!: RunState;
  private readonly owned = new Map<string, number>();
  /** Level-ups earned but not yet offered; drained one overlay at a time in `update`. */
  private pendingLevelUps = 0;

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
    this.owned.clear();
    this.pendingLevelUps = 0;

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
    // Its colliders belong to the physics world, so nothing needs to hold the
    // system until a spell has a group to hand `addSpellGroup` (Epic D).
    new CollisionSystem(this, this.player, this.enemies, this.gems, {
      onEnemyContact: (enemy) => this.onEnemyContact(enemy),
      onGemPickup: (gem) => this.onGemPickup(gem),
    });

    const { width, height } = this.scale;
    // Below the HUD's timer and boss bar, which own the top of the screen.
    this.addOverlayText(width / 2, 96, `Game (stub)\nspell ${spellId} · seed ${seed}`);
    this.debugText = this.addOverlayText(width / 2, 136, '');
    this.updateDebugText();
    this.addOverlayText(width / 2, height - 40, 'WASD / arrows or gamepad stick / D-pad to move');

    const buttons = [
      addTextButton(this, width / 2, height * 0.6, 'Level up', () => this.grantLevel()),
      addTextButton(this, width / 2, height * 0.67, 'Kill all', () => this.killAllEnemies()),
      addTextButton(this, width * 0.4, height * 0.81, 'Win', () => this.endRun('win')),
      addTextButton(this, width * 0.6, height * 0.81, 'Lose', () => this.endRun('lose')),
    ];
    buttons.forEach((button) => button.setScrollFactor(0).setDepth(UI_DEPTH));

    const onPick = (pick: LevelUpPickPayload): void => this.applyPick(pick.perkId);
    this.events.on(LEVEL_UP_EVENT.pick, onPick);
    // Spec §4 step 4: the player reaching 0 HP is the losing end of the run.
    const onDied = (): void => this.endRun('lose');
    this.events.once(PLAYER_EVENT.died, onDied);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(LEVEL_UP_EVENT.pick, onPick);
      this.events.off(PLAYER_EVENT.died, onDied);
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
    this.enemies.update(frame.deltaMs, this.player);
    this.gems.update(this.player);
    this.updateDebugText();
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
    if (!enemy.active) return;
    if (!enemy.tryContact()) return;
    this.player.takeDamage(enemy.contactDamage);
  }

  /** Spec §5: a gem is XP on touch; the drop itself is handled where the enemy dies. */
  private onGemPickup(gem: XpGem): void {
    const gained = this.gems.collect(gem);
    if (gained === 0) return;
    this.pendingLevelUps += this.run.addXp(gained);
    this.updateDebugText();
  }

  /**
   * Spec §5: a death drops gems where the enemy fell (1, or 3 for a tank).
   * The only killer so far is the debug button below; spells (Epic D) and the
   * boss call the same path.
   */
  private killEnemy(enemy: Enemy): void {
    if (!enemy.active) return;
    const { x, y, enemyType } = enemy;
    if (!enemy.takeDamage(DEBUG_KILL_DAMAGE)) return;
    this.run.recordKill();
    this.gems.dropFor(enemyType, x, y);
  }

  /** Debug stand-in for spells (Epic D): wipe the arena and watch it rain gems. */
  private killAllEnemies(): void {
    for (const child of this.enemies.group.getChildren()) {
      if (child instanceof Enemy) this.killEnemy(child);
    }
    this.updateDebugText();
  }

  private updateDebugText(): void {
    this.debugText.setText(
      `enemies ${this.enemies.liveCount} / ${MAX_LIVE_ENEMIES} · gems ${this.gems.liveCount} · ` +
        `xp ${this.run.xp}/${this.run.xpToNext} · lv ${this.run.level} · ` +
        `kills ${this.run.kills} · ${this.run.phase}`,
    );
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

  private addOverlayText(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#cccccc',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);
  }

  /** Debug stand-in for collecting gems: enough XP to cross the current threshold. */
  private grantLevel(): void {
    this.pendingLevelUps += this.run.addXp(this.run.xpToNext - this.run.xp);
    this.updateDebugText();
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
   * +10 max HP silently and keep running. Eligibility and the seeded pick come
   * from the stub pool here until CO-041's `perkOffer` replaces them.
   *
   * Returns whether the overlay was launched (and Game paused).
   */
  private openLevelUp(): boolean {
    const rankOf = (id: string): number => this.owned.get(id) ?? 0;
    const eligible = STUB_PERKS.filter((p) => rankOf(p.id) < p.maxRank);
    const offer = this.rng.shuffle(eligible).map((p) => ({ ...p, rank: rankOf(p.id) + 1 }));

    const resolution = resolveLevelUp(offer);
    if (resolution.kind === 'fallback') {
      this.player.grantMaxHp(resolution.maxHpBonus);
      return false;
    }
    const payload: LevelUpPayload = { offer: resolution.cards };
    this.scene.pause();
    this.scene.launch(SCENE.levelUp, payload);
    return true;
  }

  private applyPick(perkId: string): void {
    const perk = STUB_PERKS.find((p) => p.id === perkId);
    if (!perk) {
      console.warn(`[Game] ignoring pick of unknown perk "${perkId}"`);
      return;
    }
    this.owned.set(perkId, (this.owned.get(perkId) ?? 0) + 1);
    // `RunStats.perks` carries display names; Result collapses repeats to `name ×n`.
    this.run.recordPerk(perk.name);
  }

  private endRun(outcome: Outcome): void {
    if (!this.payload) return;
    this.run.end();
    const payload: ResultPayload = { outcome, stats: this.run.stats(this.payload.spellId) };
    // The HUD is a parallel scene; stopping Game does not stop it.
    this.scene.stop(SCENE.hud);
    this.scene.start(SCENE.result, payload);
  }
}
