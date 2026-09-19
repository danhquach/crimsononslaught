import Phaser from 'phaser';
import { SOUNDS, SOUND_KEYS, type SoundKey } from '../config/sounds';
import {
  effectiveVolume,
  readAudioSettings,
  shouldPlay,
  type AudioSettings,
  type PlayLedger,
} from '../core/audioMix';
import { AUDIO_REGISTRY_KEY } from '../core/scenePayloads';

/**
 * The one audio layer (CO-102): scenes ask for a sound by `SoundKey` the way
 * they ask for a texture by key, and nothing else reaches `scene.sound`.
 *
 * Two loader steps, mirroring the atlas: `queueSounds` in `BootScene.preload`,
 * then `installAudio` in `create` builds the `Audio` and parks it in the
 * registry, where `audioOf` finds it from any scene.
 *
 * Audio never feeds back into gameplay: `play` reads the clock only to cap
 * repeats, and every path out of it is a no-op for the run.
 */

export function queueSounds(scene: Phaser.Scene): void {
  for (const key of SOUND_KEYS) scene.load.audio(key, [...SOUNDS[key].files]);
}

/**
 * A clip that did not load is one console warning, not a crash. Checked after
 * `preload` like the atlas: a file that downloads but will not decode never
 * reaches the audio cache either way, and `Audio.play` skips it.
 */
export function warnIfSoundsMissing(scene: Phaser.Scene): SoundKey[] {
  const missing = SOUND_KEYS.filter((key) => !scene.cache.audio.exists(key));
  if (missing.length > 0)
    console.warn(`[audio] ${missing.length} clip(s) did not load: ${missing.join(', ')}`);
  return missing;
}

export class Audio {
  private readonly sound: Phaser.Sound.BaseSoundManager;
  private readonly cache: Phaser.Cache.BaseCache;
  private readonly onChange: (settings: Readonly<AudioSettings>) => void;
  private readonly now: () => number;
  private current: AudioSettings;
  private ledger: PlayLedger = {};
  private readonly warned = new Set<string>();

  /**
   * `onChange` is told every settings change so the caller can persist it;
   * `now` is the dedupe clock, wall time by default. Neither is read by the run.
   */
  constructor(
    sound: Phaser.Sound.BaseSoundManager,
    cache: Phaser.Cache.BaseCache,
    settings: AudioSettings,
    onChange: (settings: Readonly<AudioSettings>) => void = () => {},
    now: () => number = () => performance.now(),
  ) {
    this.sound = sound;
    this.cache = cache;
    this.onChange = onChange;
    this.now = now;
    this.current = { ...settings };
  }

  get settings(): Readonly<AudioSettings> {
    return this.current;
  }

  /** Change any of the settings; the rest keep their values. Reported through `onChange`. */
  setSettings(patch: Partial<AudioSettings>): void {
    this.current = { ...this.current, ...patch };
    this.onChange(this.current);
  }

  toggleMute(): boolean {
    this.setSettings({ muted: !this.current.muted });
    return this.current.muted;
  }

  /**
   * Play one effect. Returns whether a sound started: not when muted or silent,
   * not inside a full dedupe window, not for a clip that never loaded (warned
   * once per key), and not while the browser still has audio locked — Phaser
   * unlocks it on the first click or key, and every cue before that is simply
   * skipped rather than queued to fire all at once.
   */
  play(key: SoundKey): boolean {
    const def = SOUNDS[key];
    if (!this.cache.exists(key)) {
      this.warnOnce(key, `clip "${key}" is not loaded; skipping`);
      return false;
    }
    const volume = effectiveVolume(this.current, 'sfx', def.volume);
    if (volume <= 0 || this.sound.locked) return false;
    const decision = shouldPlay(key, this.now(), def, this.ledger);
    this.ledger = decision.ledger;
    if (!decision.play) return false;
    try {
      return this.sound.play(key, { volume });
    } catch (error) {
      this.warnOnce(key, `clip "${key}" failed to play: ${String(error)}`);
      return false;
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[audio] ${message}`);
  }
}

/**
 * Build the game's `Audio` from the saved settings and register it. `M` on
 * the page toggles mute from any scene — the keyboard plugin is per scene, so
 * the listener sits on the document. Called once, from Boot.
 */
export function installAudio(
  scene: Phaser.Scene,
  saved: Parameters<typeof readAudioSettings>[0],
  onChange: (settings: Readonly<AudioSettings>) => void,
): Audio {
  const audio = new Audio(scene.sound, scene.cache.audio, readAudioSettings(saved), onChange);
  scene.registry.set(AUDIO_REGISTRY_KEY, audio);
  // Never removed: Boot runs once per page load, so this is one listener for
  // the life of the page. A second Boot would add a second toggle.
  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== 'm' && event.key !== 'M')) return;
    console.info(`[audio] muted=${audio.toggleMute()}`);
  });
  return audio;
}

/**
 * The registered `Audio`. A scene started without Boot (a debug entry) gets a
 * silent-by-default one built on the spot, so no caller has to check.
 */
export function audioOf(scene: Phaser.Scene): Audio {
  const existing: unknown = scene.registry.get(AUDIO_REGISTRY_KEY);
  if (existing instanceof Audio) return existing;
  const audio = new Audio(scene.sound, scene.cache.audio, readAudioSettings({}));
  scene.registry.set(AUDIO_REGISTRY_KEY, audio);
  return audio;
}
