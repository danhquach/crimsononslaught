import Phaser from 'phaser';
import {
  SCENE,
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
import { emitRunEvent } from '../core/runEvents';
import { ENEMY_TYPES, MAX_LIVE_ENEMIES } from '../config/enemies';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { XpGem } from '../entities/XpGem';
import { EnemyPool } from '../systems/EnemyPool';
import { GemPool } from '../systems/GemPool';
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

/** Debug spawn button: enemies per press, and the ring they appear on around the player. */
const DEBUG_SPAWN_BATCH = 50;
const DEBUG_SPAWN_RADIUS_MIN = 500;
const DEBUG_SPAWN_RADIUS_MAX = 700;
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
 * `core/runEvents.ts`) so the HUD is live. "Level up" drives the level-up flow
 * (pause -> LevelUp overlay -> pick -> resume, or the zero-perk fallback) from
 * a stub perk pool until CO-031 / CO-042 trigger it from XP and the real trees.
 * The player carries HP and damage intake (CO-021) and enemies chase and damage
 * them on contact (CO-022); HP 0 ends the run as a loss (spec §4 step 4).
 * Deaths drop XP gems that drift in and count XP (CO-023). "Spawn 50" stands in
 * for the spawn director until CO-025 and "Kill all" for spells (Epic D), which
 * are what will kill enemies in a real run. CO-030's RunState takes over every
 * run event and CO-031 turns collected XP into levels.
 */
export class GameScene extends Phaser.Scene {
  private payload: GamePayload | null = null;
  private player!: Player;
  private enemies!: EnemyPool;
  private gems!: GemPool;
  private debugText!: Phaser.GameObjects.Text;
  private rng!: Rng;
  private elapsedMs = 0;
  private level = 1;
  private xp = 0;
  private readonly owned = new Map<string, number>();
  private perks: string[] = [];

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
    this.elapsedMs = 0;
    this.level = 1;
    this.xp = 0;
    this.owned.clear();
    this.perks = [];

    this.buildArena();
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.cameras.main.startFollow(this.player, true);

    this.enemies = new EnemyPool(this);
    // Spec §5: contact damage. CO-032 moves every overlap into CollisionSystem.
    this.physics.add.overlap(this.player, this.enemies.group, (_player, enemy) => {
      if (enemy instanceof Enemy) this.onEnemyContact(enemy);
    });

    this.gems = new GemPool(this);
    // Spec §5: gems are XP on touch. CO-032 moves every overlap into CollisionSystem.
    this.physics.add.overlap(this.player, this.gems.group, (_player, gem) => {
      if (gem instanceof XpGem) this.onGemPickup(gem);
    });

    const { width, height } = this.scale;
    // Below the HUD's timer and boss bar, which own the top of the screen.
    this.addOverlayText(width / 2, 96, `Game (stub)\nspell ${spellId} · seed ${seed}`);
    this.debugText = this.addOverlayText(width / 2, 136, '');
    this.updateDebugText();
    this.addOverlayText(width / 2, height - 40, 'WASD / arrows or gamepad stick / D-pad to move');

    const buttons = [
      addTextButton(this, width / 2, height * 0.6, 'Level up', () => this.levelUp()),
      addTextButton(this, width / 2, height * 0.67, `Spawn ${DEBUG_SPAWN_BATCH}`, () =>
        this.spawnDebugWave(),
      ),
      addTextButton(this, width / 2, height * 0.74, 'Kill all', () => this.killAllEnemies()),
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

  /** Run clock accumulates scene delta, so it freezes with the scene when Game is paused. */
  update(_time: number, delta: number): void {
    if (!this.payload) return;
    this.player.update(delta);
    this.enemies.update(delta, this.player);
    this.gems.update(this.player);
    this.elapsedMs += delta;
    emitRunEvent(this.events, 'timer', { elapsedMs: this.elapsedMs });
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
    this.xp += gained;
    emitRunEvent(this.events, 'xp', { xp: this.xp, xpToNext: 0, level: this.level });
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
    this.gems.dropFor(enemyType, x, y);
  }

  /** Debug stand-in for spells (Epic D): wipe the arena and watch it rain gems. */
  private killAllEnemies(): void {
    for (const child of this.enemies.group.getChildren()) {
      if (child instanceof Enemy) this.killEnemy(child);
    }
    this.updateDebugText();
  }

  /**
   * Debug stand-in for the spawn director (CO-025): a batch of mixed enemies on
   * a ring around the player. Requests past the live cap come back `null` from
   * the pool and are simply dropped (spec §5).
   */
  private spawnDebugWave(): void {
    for (let i = 0; i < DEBUG_SPAWN_BATCH; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = this.rng.int(DEBUG_SPAWN_RADIUS_MIN, DEBUG_SPAWN_RADIUS_MAX);
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 0, WORLD_WIDTH);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 0, WORLD_HEIGHT);
      this.enemies.spawn(this.rng.pick(ENEMY_TYPES), x, y);
    }
    this.updateDebugText();
  }

  private updateDebugText(): void {
    this.debugText.setText(
      `enemies ${this.enemies.liveCount} / ${MAX_LIVE_ENEMIES} · gems ${this.gems.liveCount} · xp ${this.xp}`,
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

  /**
   * Spec §5: pause and offer up to 3 eligible perks; with none eligible grant
   * +10 max HP silently and keep running. Eligibility and the seeded pick come
   * from the stub pool here until CO-041's `perkOffer` replaces them.
   */
  private levelUp(): void {
    this.level += 1;
    emitRunEvent(this.events, 'xp', { xp: this.xp, xpToNext: 0, level: this.level });

    const rankOf = (id: string): number => this.owned.get(id) ?? 0;
    const eligible = STUB_PERKS.filter((p) => rankOf(p.id) < p.maxRank);
    const offer = this.rng.shuffle(eligible).map((p) => ({ ...p, rank: rankOf(p.id) + 1 }));

    const resolution = resolveLevelUp(offer);
    if (resolution.kind === 'fallback') {
      this.player.grantMaxHp(resolution.maxHpBonus);
      return;
    }
    const payload: LevelUpPayload = { offer: resolution.cards };
    this.scene.pause();
    this.scene.launch(SCENE.levelUp, payload);
  }

  private applyPick(perkId: string): void {
    const perk = STUB_PERKS.find((p) => p.id === perkId);
    if (!perk) {
      console.warn(`[Game] ignoring pick of unknown perk "${perkId}"`);
      return;
    }
    this.owned.set(perkId, (this.owned.get(perkId) ?? 0) + 1);
    // `RunStats.perks` carries display names; Result collapses repeats to `name ×n`.
    this.perks.push(perk.name);
  }

  private endRun(outcome: Outcome): void {
    if (!this.payload) return;
    const payload: ResultPayload = {
      outcome,
      stats: {
        timeSurvivedMs: this.elapsedMs,
        level: this.level,
        kills: 0,
        spellId: this.payload.spellId,
        perks: this.perks,
      },
    };
    // The HUD is a parallel scene; stopping Game does not stop it.
    this.scene.stop(SCENE.hud);
    this.scene.start(SCENE.result, payload);
  }
}
