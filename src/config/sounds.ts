/**
 * Sound effects (CO-102): every clip the game can ask for, by key, and how
 * loud and how often each may play.
 *
 * Pure data, no Phaser import. `core/audioMix.ts` applies the volumes and the
 * dedupe window; `render/audio.ts` loads the files and plays them. Nothing in
 * the run loop reads this: a run stays a function of its seed with audio on or
 * off.
 *
 * The clips themselves are synthesized by `npm run audio:gen`
 * (`scripts/gen-audio.mjs`), which reads `SOUND_KEYS` off this file so a key
 * without a clip fails the script rather than the run. Licences are recorded
 * in `public/assets/audio/CREDITS.md`.
 */

/** Where the clips live under `public/`, as the loader sees them. */
export const AUDIO_DIR = 'assets/audio';

export const SOUND_KEYS = [
  'cast.fire',
  'cast.ice',
  'cast.lightning',
  'cast.earth',
  'enemy.hurt',
  'enemy.death',
  'player.hurt',
  'player.lowHealth',
  'player.death',
  'progress.gem',
  'progress.levelUp',
  'progress.perk',
  'boss.spawn',
  'boss.telegraph',
  'boss.charge',
  'boss.death',
  'ui.move',
  'ui.confirm',
  'ui.back',
] as const;

export type SoundKey = (typeof SOUND_KEYS)[number];

export function isSoundKey(value: unknown): value is SoundKey {
  return typeof value === 'string' && (SOUND_KEYS as readonly string[]).includes(value);
}

export interface SoundDef {
  /** Candidate files, first the browser can decode wins; paths relative to `public/`. */
  readonly files: readonly string[];
  /** Clip gain in [0, 1], before the master and effects volumes. */
  readonly volume: number;
  /** Length of the dedupe window, ms. */
  readonly minGapMs: number;
  /** How many starts of this key one window may hold; the rest are dropped, never queued. */
  readonly maxConcurrent: number;
}

const clip = (key: SoundKey, volume: number, minGapMs: number, maxConcurrent = 1): SoundDef => ({
  files: [`${AUDIO_DIR}/${key}.wav`],
  volume,
  minGapMs,
  maxConcurrent,
});

/**
 * Windows are sized to the moments they cap: a maxed fire build at
 * `?timeScale=10` kills dozens of enemies a second, so hurt and death allow a
 * few starts per short window and drop the rest; a level-up or a boss cue is
 * one event and needs no cap beyond one per window.
 */
export const SOUNDS: Readonly<Record<SoundKey, SoundDef>> = {
  'cast.fire': clip('cast.fire', 0.5, 90, 2),
  'cast.ice': clip('cast.ice', 0.5, 90, 2),
  'cast.lightning': clip('cast.lightning', 0.45, 90, 2),
  'cast.earth': clip('cast.earth', 0.55, 90, 2),
  'enemy.hurt': clip('enemy.hurt', 0.35, 80, 3),
  'enemy.death': clip('enemy.death', 0.45, 80, 3),
  'player.hurt': clip('player.hurt', 0.7, 100),
  'player.lowHealth': clip('player.lowHealth', 0.6, 2000),
  'player.death': clip('player.death', 0.9, 500),
  'progress.gem': clip('progress.gem', 0.35, 60, 2),
  'progress.levelUp': clip('progress.levelUp', 0.7, 200),
  'progress.perk': clip('progress.perk', 0.6, 200),
  'boss.spawn': clip('boss.spawn', 0.9, 500),
  'boss.telegraph': clip('boss.telegraph', 0.7, 300),
  'boss.charge': clip('boss.charge', 0.7, 300),
  'boss.death': clip('boss.death', 1, 500),
  'ui.move': clip('ui.move', 0.4, 30),
  'ui.confirm': clip('ui.confirm', 0.5, 50),
  'ui.back': clip('ui.back', 0.5, 50),
};

/** HP at or below this share of the maximum plays `player.lowHealth` on each hit. */
export const LOW_HEALTH_RATIO = 0.25;

/**
 * The player's audio settings as saved (`Save.settings`, CO-101) and their
 * defaults. Volumes are gains in [0, 1]. `music` has no consumer yet: the
 * channel exists so music can land without touching the effects (CO-102).
 */
export const DEFAULT_AUDIO_SETTINGS = {
  master: 1,
  sfx: 1,
  music: 1,
  muted: false,
} as const;

/** `Save.settings` keys the audio settings are stored under. */
export const AUDIO_SETTING_KEYS = {
  master: 'audio.master',
  sfx: 'audio.sfx',
  music: 'audio.music',
  muted: 'audio.muted',
} as const;

/**
 * The cast cue for a spell: its element's. Roster ids are `<element>` or
 * `<element>_<name>` (Phase 2 spec §3), so the prefix is the element.
 * `undefined` for an id no element owns, which then casts silently.
 */
export function castSoundFor(spellId: string): SoundKey | undefined {
  const element = spellId.split('_')[0];
  switch (element) {
    case 'fire':
      return 'cast.fire';
    case 'ice':
      return 'cast.ice';
    case 'lightning':
      return 'cast.lightning';
    case 'earth':
      return 'cast.earth';
    default:
      return undefined;
  }
}
