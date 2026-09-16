import Phaser from 'phaser';
import { SCENE, isResultPayload, type ResultPayload } from '../core/scenePayloads';
import { addTextButton } from './ui';

/**
 * Stub result screen: outcome headline, raw stats, "Play again" -> SpellSelect.
 * Started without a valid payload it falls back to SpellSelect (spec §7).
 * CO-014 formats the stats and adds Enter / gamepad confirm.
 */
export class ResultScene extends Phaser.Scene {
  private payload: ResultPayload | null = null;

  constructor() {
    super(SCENE.result);
  }

  init(data: unknown): void {
    this.payload = isResultPayload(data) ? data : null;
    // Phaser keeps the last `start(key, data)` payload in settings.data and
    // replays it when the scene is later started with no data. Clear it so
    // a payload-less start is seen as missing every time, not just the first.
    this.scene.settings.data = {};
  }

  create(): void {
    if (!this.payload) {
      console.warn('[Result] started without a valid payload; returning to SpellSelect');
      this.scene.start(SCENE.spellSelect);
      return;
    }
    const { outcome, stats } = this.payload;
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.25, outcome === 'win' ? 'Victory' : 'Defeat', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: outcome === 'win' ? '#ffd700' : '#dc143c',
      })
      .setOrigin(0.5);

    const seconds = (stats.timeSurvivedMs / 1000).toFixed(1);
    this.add
      .text(
        width / 2,
        height * 0.5,
        [
          `spell ${stats.spellId}`,
          `time ${seconds}s`,
          `level ${stats.level}`,
          `kills ${stats.kills}`,
          `perks ${stats.perks.length ? stats.perks.join(', ') : 'none'}`,
        ].join('\n'),
        { fontFamily: 'monospace', fontSize: '20px', align: 'center' },
      )
      .setOrigin(0.5);

    addTextButton(this, width / 2, height * 0.8, 'Play again', () =>
      this.scene.start(SCENE.spellSelect),
    );
  }
}
