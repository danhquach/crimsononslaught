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
import { createRng, type Rng } from '../core/rng';
import { emitRunEvent } from '../core/runEvents';
import { addTextButton } from './ui';

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
 * Stub run: shows the payload it was started with, launches the HUD overlay,
 * and offers Win / Lose buttons that end the run with a full `ResultPayload`.
 * Emits the run clock on `this.events` (see `core/runEvents.ts`) so the HUD is
 * live. "Level up" drives the level-up flow (pause -> LevelUp overlay -> pick
 * -> resume, or the zero-perk fallback) from a stub perk pool until CO-031 /
 * CO-042 trigger it from XP and the real trees. CO-030's RunState takes over
 * every run event, and CO-020+ replace the stub body with the world, player
 * and systems.
 */
export class GameScene extends Phaser.Scene {
  private payload: GamePayload | null = null;
  private rng!: Rng;
  private elapsedMs = 0;
  private level = 1;
  private hp = 100;
  private maxHp = 100;
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
    this.hp = 100;
    this.maxHp = 100;
    this.owned.clear();
    this.perks = [];

    const { width, height } = this.scale;
    this.add.image(width / 2, height / 2, 'player');
    this.add
      .text(width / 2, height * 0.3, `Game (stub)\nspell ${spellId} · seed ${seed}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        align: 'center',
      })
      .setOrigin(0.5);

    addTextButton(this, width / 2, height * 0.6, 'Level up', () => this.levelUp());
    addTextButton(this, width * 0.4, height * 0.78, 'Win', () => this.endRun('win'));
    addTextButton(this, width * 0.6, height * 0.78, 'Lose', () => this.endRun('lose'));

    const onPick = (pick: LevelUpPickPayload): void => this.applyPick(pick.perkId);
    this.events.on(LEVEL_UP_EVENT.pick, onPick);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(LEVEL_UP_EVENT.pick, onPick);
    });

    this.scene.launch(SCENE.hud);
  }

  /** Run clock accumulates scene delta, so it freezes with the scene when Game is paused. */
  update(_time: number, delta: number): void {
    if (!this.payload) return;
    this.elapsedMs += delta;
    emitRunEvent(this.events, 'timer', { elapsedMs: this.elapsedMs });
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
      this.maxHp += resolution.maxHpBonus;
      emitRunEvent(this.events, 'hp', { hp: this.hp, maxHp: this.maxHp });
      return;
    }
    const payload: LevelUpPayload = { offer: resolution.cards };
    this.scene.pause();
    this.scene.launch(SCENE.levelUp, payload);
  }

  private applyPick(perkId: string): void {
    if (!STUB_PERKS.some((p) => p.id === perkId)) {
      console.warn(`[Game] ignoring pick of unknown perk "${perkId}"`);
      return;
    }
    this.owned.set(perkId, (this.owned.get(perkId) ?? 0) + 1);
    this.perks.push(perkId);
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
