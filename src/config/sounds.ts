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
 * (`scripts/gen-audio.mjs`), which reads `SOUND_KEYS` and `MUSIC_KEYS` off
 * this file so a key without a clip fails the script rather than the run. A
 * few are sourced recordings cut by `npm run audio:cut` instead (CO-177).
 * Licences are recorded in `public/assets/audio/CREDITS.md`.
 */

import type { ConsumableKind } from './pickups';

/** Where the clips live under `public/`, as the loader sees them. */
export const AUDIO_DIR = 'assets/audio';

export const SOUND_KEYS = [
  'cast.fire',
  'cast.ice',
  'cast.lightning',
  'cast.earth',
  'cast.fire_meteor',
  'cast.fire_column',
  'cast.fire_companion',
  'cast.fire_dragon',
  'cast.ice_nova_bomb',
  'cast.ice_shield',
  'cast.ice_companion',
  'cast.ice_blizzard',
  'cast.lightning_chain',
  'cast.lightning_tornado',
  'cast.lightning_companion',
  'cast.lightning_sword',
  'cast.earth_boulder',
  'cast.earth_shield',
  'cast.earth_quake',
  'cast.earth_companion',
  'enemy.hurt',
  'enemy.death',
  'player.hurt',
  'player.lowHealth',
  'player.death',
  'player.dash',
  'player.dashReady',
  'progress.gem',
  'progress.levelUp',
  'progress.perk',
  'pickup.ember',
  'pickup.relic',
  'pickup.health',
  'pickup.magnet',
  'pickup.bomb',
  'pickup.chest',
  'pickup.magnetPull',
  'pickup.bombBlast',
  'shield.hit',
  'shield.break',
  'boss.spawn',
  'boss.telegraph',
  'boss.charge',
  'boss.barBreak',
  'boss.enrage',
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
  // The sourced whoosh (CO-177) is twice the old blip's length and louder on
  // average, so it plays quieter: a capped stream of casts stays under clipping.
  'cast.fire': clip('cast.fire', 0.28, 90, 2),
  'cast.ice': clip('cast.ice', 0.5, 90, 2),
  'cast.lightning': clip('cast.lightning', 0.45, 90, 2),
  'cast.earth': clip('cast.earth', 0.55, 90, 2),
  // Every spell has its own cue since CO-158, and a window is per key, so three
  // spells of one element no longer share one ledger: each plays quieter than
  // its element's default and takes one start per window. Each window is
  // shorter than its spell's fastest cast in a 1x run (base cadence at the 0.35
  // cooldown floor: 0.28 s for a companion, 1.1 s for Meteor), so it only bites
  // a scaled run; the longest clips take the widest windows so a flood of them
  // stays under clipping (`scripts/lib/castAudio.test.mjs`).
  'cast.fire_meteor': clip('cast.fire_meteor', 0.3, 400),
  'cast.fire_column': clip('cast.fire_column', 0.28, 300),
  'cast.fire_companion': clip('cast.fire_companion', 0.25, 150),
  'cast.fire_dragon': clip('cast.fire_dragon', 0.3, 300),
  'cast.ice_nova_bomb': clip('cast.ice_nova_bomb', 0.4, 120),
  'cast.ice_companion': clip('cast.ice_companion', 0.35, 150),
  'cast.ice_blizzard': clip('cast.ice_blizzard', 0.4, 400),
  'cast.lightning_chain': clip('cast.lightning_chain', 0.4, 120),
  'cast.lightning_tornado': clip('cast.lightning_tornado', 0.4, 400),
  'cast.lightning_companion': clip('cast.lightning_companion', 0.35, 150),
  'cast.earth_boulder': clip('cast.earth_boulder', 0.45, 200),
  'cast.earth_quake': clip('cast.earth_quake', 0.5, 400),
  'cast.earth_companion': clip('cast.earth_companion', 0.4, 150),
  // Always-on spells cue when they come up: on equip, and a shield again each
  // time it reforms from empty. An equip lands on the frame `progress.perk`
  // plays, so these sit under it.
  'cast.ice_shield': clip('cast.ice_shield', 0.35, 200),
  'cast.lightning_sword': clip('cast.lightning_sword', 0.35, 200),
  'cast.earth_shield': clip('cast.earth_shield', 0.4, 200),
  'enemy.hurt': clip('enemy.hurt', 0.35, 80, 3),
  // The sourced hit (CO-177) rings twice as long as the old blip: two starts
  // per window, not three, keep a wave of deaths under clipping.
  'enemy.death': clip('enemy.death', 0.45, 80, 2),
  'player.hurt': clip('player.hurt', 0.7, 100),
  'player.lowHealth': clip('player.lowHealth', 0.6, 2000),
  'player.death': clip('player.death', 0.9, 500),
  // #384: a dash is one press and the cooldown is seconds long, so one start per window is plenty.
  'player.dash': clip('player.dash', 0.5, 150),
  'player.dashReady': clip('player.dashReady', 0.3, 500),
  'progress.gem': clip('progress.gem', 0.35, 60, 2),
  'progress.levelUp': clip('progress.levelUp', 0.7, 200),
  'progress.perk': clip('progress.perk', 0.6, 200),
  // A bomb leaves Embers in piles, and overlapping contacts hit a shield
  // together: those two take a few per window. The rest are one event each.
  'pickup.ember': clip('pickup.ember', 0.35, 60, 2),
  'pickup.relic': clip('pickup.relic', 0.6, 200),
  'pickup.health': clip('pickup.health', 0.5, 100),
  'pickup.magnet': clip('pickup.magnet', 0.45, 100),
  'pickup.bomb': clip('pickup.bomb', 0.45, 100),
  'pickup.chest': clip('pickup.chest', 0.55, 100),
  'pickup.magnetPull': clip('pickup.magnetPull', 0.55, 300),
  'pickup.bombBlast': clip('pickup.bombBlast', 0.8, 300),
  'shield.hit': clip('shield.hit', 0.45, 100, 2),
  'shield.break': clip('shield.break', 0.7, 200),
  'boss.spawn': clip('boss.spawn', 0.9, 500),
  'boss.telegraph': clip('boss.telegraph', 0.7, 300),
  'boss.charge': clip('boss.charge', 0.7, 300),
  'boss.barBreak': clip('boss.barBreak', 0.9, 300),
  'boss.enrage': clip('boss.enrage', 1, 500),
  'boss.death': clip('boss.death', 1, 500),
  'ui.move': clip('ui.move', 0.4, 30),
  'ui.confirm': clip('ui.confirm', 0.5, 50),
  'ui.back': clip('ui.back', 0.5, 50),
};

/**
 * Music (CO-157): one looping track per stretch of the game. Kept out of
 * `SOUND_KEYS`: a track loops, is never deduped and plays on the `music`
 * channel, and only one is heard at a time, crossfading over `MUSIC_FADE_MS`
 * (`core/musicMix.ts`). Generated by `npm run audio:gen` like the effects.
 */
export const MUSIC_KEYS = [
  'music.menu',
  'music.run_march',
  'music.run_organ',
  'music.boss_doom',
  'music.boss_cathedral',
] as const;

export type MusicKey = (typeof MUSIC_KEYS)[number];

/** The run's tracks; each run draws one of them (`core/musicMix.ts`). */
export const RUN_TRACKS: readonly MusicKey[] = ['music.run_march', 'music.run_organ'];

/** The boss's tracks; each run draws one of them too. */
export const BOSS_TRACKS: readonly MusicKey[] = ['music.boss_doom', 'music.boss_cathedral'];

export interface MusicDef {
  /** Candidate files, first the browser can decode wins; paths relative to `public/`. */
  readonly files: readonly string[];
  /** Track gain in [0, 1], before the master and music volumes. */
  readonly volume: number;
}

const track = (key: MusicKey, volume: number): MusicDef => ({
  files: [`${AUDIO_DIR}/${key}.wav`],
  volume,
});

/**
 * A track plays without a break for a whole run, and the cast and hurt cues
 * have to cut through it: every run and boss track plays at least 6 dB (RMS)
 * under every default cast cue and both hurt cues
 * (`scripts/lib/music.test.mjs`). The menus have no fight to hear over, so
 * their track is louder.
 */
export const MUSIC: Readonly<Record<MusicKey, MusicDef>> = {
  'music.menu': track('music.menu', 0.2),
  'music.run_march': track('music.run_march', 0.16),
  'music.run_organ': track('music.run_organ', 0.16),
  'music.boss_doom': track('music.boss_doom', 0.16),
  'music.boss_cathedral': track('music.boss_cathedral', 0.16),
};

/** How long a change of track takes, wall-clock ms: the old one fades out as the new one fades in. */
export const MUSIC_FADE_MS = 1000;

/** HP at or below this share of the maximum plays `player.lowHealth` on each hit. */
export const LOW_HEALTH_RATIO = 0.25;

/**
 * The player's audio settings as saved (`Save.settings`, CO-101) and their
 * defaults. Volumes are gains in [0, 1]. `sfx` scales the effects and `music`
 * the tracks (CO-157); `master` and `muted` both.
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

/** The pickup cue for each consumable (CO-159). */
const CONSUMABLE_SOUNDS: Readonly<Record<ConsumableKind, SoundKey>> = {
  health: 'pickup.health',
  magnet: 'pickup.magnet',
  bomb: 'pickup.bomb',
  chest: 'pickup.chest',
};

/** The cue for picking up a consumable of `kind`. */
export function consumableSoundFor(kind: ConsumableKind): SoundKey {
  return CONSUMABLE_SOUNDS[kind];
}

/**
 * The cast cue for a spell: its own, `cast.<spellId>` (CO-158), or its
 * element's when it has none, so a spell added to the roster without a clip is
 * never silent. A default spell keeps its element's id, so `cast.fire` is both
 * Fire Bolt's cue and the fire fallback. Roster ids are `<element>` or
 * `<element>_<name>` (Phase 2 spec §3), so the prefix is the element.
 * `undefined` for an id no element owns, which then casts silently.
 */
export function castSoundFor(spellId: string): SoundKey | undefined {
  const own = `cast.${spellId}`;
  if (isSoundKey(own)) return own;
  const element = `cast.${spellId.split('_')[0]}`;
  return isSoundKey(element) ? element : undefined;
}
