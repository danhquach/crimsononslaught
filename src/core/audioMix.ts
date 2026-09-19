import { AUDIO_SETTING_KEYS, DEFAULT_AUDIO_SETTINGS } from '../config/sounds';
import type { SaveSettings } from './save';

/**
 * The audio rules that need no engine (CO-102): what volume a clip plays at
 * given the player's settings, whether a request may play at all given how
 * many identical ones just did, and how the settings move in and out of the
 * save. `render/audio.ts` is the only caller; nothing here touches Phaser or
 * the run's RNG.
 *
 * Pure TS, no Phaser import.
 */

/** Gains in [0, 1]; `music` is reserved for a later music layer. */
export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export type AudioChannel = 'sfx' | 'music';

/** A gain clamped into [0, 1]; anything unusable becomes `fallback`. */
export function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * The gain a clip plays at: master × channel × the clip's own gain, or 0 when
 * muted. 0 is the caller's cue to skip the play entirely rather than start a
 * silent sound.
 */
export function effectiveVolume(
  settings: Readonly<AudioSettings>,
  channel: AudioChannel,
  clipVolume = 1,
): number {
  if (settings.muted) return 0;
  return (
    clampVolume(settings.master, 0) * clampVolume(settings[channel], 0) * clampVolume(clipVolume, 0)
  );
}

/** Start times of recent plays, per key, most recent last. */
export type PlayLedger = Readonly<Record<string, readonly number[]>>;

export interface PlayRule {
  /** Length of the window, ms. */
  readonly minGapMs: number;
  /** Starts of one key a window may hold. */
  readonly maxConcurrent: number;
}

export interface PlayDecision {
  readonly play: boolean;
  readonly ledger: PlayLedger;
}

/**
 * The dedupe window: a key may start at most `maxConcurrent` times in any
 * `minGapMs` window; a request past that is dropped, never queued, the rule
 * every pool follows. Twenty enemies dying on one frame play a few deaths, not
 * twenty. Returns the ledger to carry into the next call; the one passed in is
 * untouched. Starts older than the window are forgotten, so the ledger stays
 * the size of the window whatever the run length. A clock that moves backwards
 * (a tab restored with a fresh `performance.now()`) is treated as a new window.
 */
export function shouldPlay(
  key: string,
  nowMs: number,
  rule: PlayRule,
  ledger: PlayLedger,
): PlayDecision {
  const window = rule.minGapMs > 0 ? rule.minGapMs : 0;
  const recent = (ledger[key] ?? []).filter((at) => at <= nowMs && nowMs - at < window);
  if (recent.length >= Math.max(1, Math.floor(rule.maxConcurrent))) {
    return { play: false, ledger: { ...ledger, [key]: recent } };
  }
  return { play: true, ledger: { ...ledger, [key]: [...recent, nowMs] } };
}

/**
 * The audio settings held in a save's `settings`, defaults filling any key
 * that is missing or unusable, so a save written before audio existed — or by
 * a settings panel with a bug — still plays.
 */
export function readAudioSettings(saved: Readonly<SaveSettings>): AudioSettings {
  const muted = saved[AUDIO_SETTING_KEYS.muted];
  return {
    master: clampVolume(saved[AUDIO_SETTING_KEYS.master], DEFAULT_AUDIO_SETTINGS.master),
    sfx: clampVolume(saved[AUDIO_SETTING_KEYS.sfx], DEFAULT_AUDIO_SETTINGS.sfx),
    music: clampVolume(saved[AUDIO_SETTING_KEYS.music], DEFAULT_AUDIO_SETTINGS.music),
    muted: typeof muted === 'boolean' ? muted : DEFAULT_AUDIO_SETTINGS.muted,
  };
}

/** A save's `settings` with the audio settings written over it; other keys kept. */
export function writeAudioSettings(
  saved: Readonly<SaveSettings>,
  audio: Readonly<AudioSettings>,
): SaveSettings {
  return {
    ...saved,
    [AUDIO_SETTING_KEYS.master]: clampVolume(audio.master, DEFAULT_AUDIO_SETTINGS.master),
    [AUDIO_SETTING_KEYS.sfx]: clampVolume(audio.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    [AUDIO_SETTING_KEYS.music]: clampVolume(audio.music, DEFAULT_AUDIO_SETTINGS.music),
    [AUDIO_SETTING_KEYS.muted]: audio.muted === true,
  };
}
