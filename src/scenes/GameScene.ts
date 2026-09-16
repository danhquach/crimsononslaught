import Phaser from 'phaser';
import {
  SCENE,
  isGamePayload,
  type GamePayload,
  type Outcome,
  type ResultPayload,
} from '../core/scenePayloads';
import { emitRunEvent } from '../core/runEvents';
import { addTextButton } from './ui';

/**
 * Stub run: shows the payload it was started with, launches the HUD overlay,
 * and offers Win / Lose buttons that end the run with a full `ResultPayload`.
 * Emits the run clock on `this.events` (see `core/runEvents.ts`) so the HUD is
 * live; CO-030's RunState takes over every run event, and CO-020+ replace the
 * stub body with the world, player and systems.
 */
export class GameScene extends Phaser.Scene {
  private payload: GamePayload | null = null;
  private elapsedMs = 0;

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
    this.elapsedMs = 0;

    const { width, height } = this.scale;
    this.add.image(width / 2, height / 2, 'player');
    this.add
      .text(width / 2, height * 0.3, `Game (stub)\nspell ${spellId} · seed ${seed}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        align: 'center',
      })
      .setOrigin(0.5);

    addTextButton(this, width * 0.4, height * 0.75, 'Win', () => this.endRun('win'));
    addTextButton(this, width * 0.6, height * 0.75, 'Lose', () => this.endRun('lose'));

    this.scene.launch(SCENE.hud);
  }

  /** Run clock accumulates scene delta, so it freezes with the scene when Game is paused. */
  update(_time: number, delta: number): void {
    if (!this.payload) return;
    this.elapsedMs += delta;
    emitRunEvent(this.events, 'timer', { elapsedMs: this.elapsedMs });
  }

  private endRun(outcome: Outcome): void {
    if (!this.payload) return;
    const payload: ResultPayload = {
      outcome,
      stats: {
        timeSurvivedMs: this.elapsedMs,
        level: 1,
        kills: 0,
        spellId: this.payload.spellId,
        perks: [],
      },
    };
    // The HUD is a parallel scene; stopping Game does not stop it.
    this.scene.stop(SCENE.hud);
    this.scene.start(SCENE.result, payload);
  }
}
