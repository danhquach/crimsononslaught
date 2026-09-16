import Phaser from 'phaser';
import { SPELL_IDS } from '../config/spells';
import { SCENE, SEED_REGISTRY_KEY, type GamePayload } from '../core/scenePayloads';
import { addTextButton } from './ui';

/**
 * Stub spell select: one button per spell id. Clicking starts Game with a full
 * `GamePayload`. CO-011 turns the buttons into cards with stats and adds keys 1–4.
 */
export class SpellSelectScene extends Phaser.Scene {
  constructor() {
    super(SCENE.spellSelect);
  }

  create(): void {
    const { width, height } = this.scale;
    const seed = this.registry.get(SEED_REGISTRY_KEY) as number;

    this.add
      .text(width / 2, height * 0.2, 'Crimson Onslaught', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: '#dc143c',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height * 0.35, 'Choose a spell', {
        fontFamily: 'Georgia, serif',
        fontSize: '24px',
      })
      .setOrigin(0.5);

    const step = width / (SPELL_IDS.length + 1);
    SPELL_IDS.forEach((spellId, i) => {
      addTextButton(this, step * (i + 1), height * 0.55, spellId, () => {
        const payload: GamePayload = { spellId, seed };
        this.scene.start(SCENE.game, payload);
      });
    });

    this.add
      .text(width / 2, height - 24, `seed ${seed}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#888888',
      })
      .setOrigin(0.5);
  }
}
