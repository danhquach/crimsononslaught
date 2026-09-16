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
import { Player } from '../entities/Player';
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
 * The player carries HP and damage intake (CO-021); "Hit (10)" stands in for
 * contact damage until enemies land in CO-022, and HP 0 ends the run as a loss
 * (spec §4 step 4). CO-030's RunState takes over every run event, and CO-022+
 * add enemies, gems and spells.
 */
export class GameScene extends Phaser.Scene {
  private payload: GamePayload | null = null;
  private player!: Player;
  private rng!: Rng;
  private elapsedMs = 0;
  private level = 1;
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
    this.owned.clear();
    this.perks = [];

    this.buildArena();
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.cameras.main.startFollow(this.player, true);

    const { width, height } = this.scale;
    // Below the HUD's timer and boss bar, which own the top of the screen.
    this.addOverlayText(width / 2, 96, `Game (stub)\nspell ${spellId} · seed ${seed}`);
    this.addOverlayText(width / 2, height - 40, 'WASD / arrows or gamepad stick / D-pad to move');

    const buttons = [
      addTextButton(this, width / 2, height * 0.6, 'Level up', () => this.levelUp()),
      addTextButton(this, width / 2, height * 0.69, 'Hit (10)', () => this.player.takeDamage(10)),
      addTextButton(this, width * 0.4, height * 0.78, 'Win', () => this.endRun('win')),
      addTextButton(this, width * 0.6, height * 0.78, 'Lose', () => this.endRun('lose')),
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
    this.elapsedMs += delta;
    emitRunEvent(this.events, 'timer', { elapsedMs: this.elapsedMs });
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

  private addOverlayText(x: number, y: number, text: string): void {
    this.add
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
    emitRunEvent(this.events, 'xp', { xp: 0, xpToNext: 0, level: this.level });

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
