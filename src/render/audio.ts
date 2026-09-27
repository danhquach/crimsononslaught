import Phaser from 'phaser';
import {
  MUSIC,
  MUSIC_FADE_MS,
  MUSIC_KEYS,
  SOUNDS,
  SOUND_KEYS,
  type MusicKey,
  type SoundKey,
} from '../config/sounds';
import {
  effectiveVolume,
  readAudioSettings,
  shouldPlay,
  type AudioSettings,
  type PlayLedger,
} from '../core/audioMix';
import {
  MUSIC_STREAM,
  musicVolume,
  pickRunMusic,
  stepMusicFade,
  type MusicGains,
  type RunMusic,
} from '../core/musicMix';
import { createRng, deriveSeed, type Rng } from '../core/rng';
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
 * repeats, music fades on wall time from the game loop's step, and every path
 * out of either is a no-op for the run.
 */

export function queueSounds(scene: Phaser.Scene): void {
  for (const key of SOUND_KEYS) scene.load.audio(key, [...SOUNDS[key].files]);
  for (const key of MUSIC_KEYS) scene.load.audio(key, [...MUSIC[key].files]);
}

/**
 * A clip that did not load is one console warning, not a crash. Checked after
 * `preload` like the atlas: a file that downloads but will not decode never
 * reaches the audio cache either way, and `Audio.play` skips it.
 */
export function warnIfSoundsMissing(scene: Phaser.Scene): (SoundKey | MusicKey)[] {
  const missing = [...SOUND_KEYS, ...MUSIC_KEYS].filter((key) => !scene.cache.audio.exists(key));
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
  private readonly musicRng: Rng;
  private wantedTrack: MusicKey | null = null;
  private runMusic: RunMusic | null = null;
  private gains: MusicGains = {};
  private readonly tracks = new Map<MusicKey, Phaser.Sound.BaseSound>();
  private readonly trackVolumes = new Map<MusicKey, number>();

  /**
   * `onChange` is told every settings change so the caller can persist it;
   * `now` is the dedupe clock, wall time by default; `musicRng` draws each
   * run's tracks, off the clock by default. None of them is read by the run.
   */
  constructor(
    sound: Phaser.Sound.BaseSoundManager,
    cache: Phaser.Cache.BaseCache,
    settings: AudioSettings,
    onChange: (settings: Readonly<AudioSettings>) => void = () => {},
    now: () => number = () => performance.now(),
    musicRng: Rng = createRng(deriveSeed(Date.now(), MUSIC_STREAM)),
  ) {
    this.musicRng = musicRng;
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
    this.applyMusicVolumes();
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

  /** The track asked for, each track's fade gain and the run's pair; what the e2e checks read. */
  get music(): {
    readonly track: MusicKey | null;
    readonly gains: MusicGains;
    readonly run: RunMusic | null;
  } {
    return { track: this.wantedTrack, gains: this.gains, run: this.runMusic };
  }

  /**
   * A run starts: draw its pair of tracks and bring in its run track. Every
   * run draws afresh, a restart included; the draw is the music's own stream,
   * never the run's.
   */
  startRunMusic(): void {
    this.runMusic = pickRunMusic(this.musicRng);
    this.playMusic(this.runMusic.run);
  }

  /** The boss is in: bring in the run's boss track. */
  startBossMusic(): void {
    this.runMusic ??= pickRunMusic(this.musicRng);
    this.playMusic(this.runMusic.boss);
  }

  /**
   * Make `key` the one track heard: the current one fades out as it fades in
   * (`core/musicMix.ts`). Asking for the track already wanted is a no-op, so
   * every menu scene can ask for the menu track and it carries on unbroken.
   * While the browser still has audio locked nothing starts; the fade waits,
   * and the track comes in with the first click or key.
   */
  playMusic(key: MusicKey): void {
    this.wantedTrack = key;
  }

  /** Fade whatever is playing out to silence. */
  stopMusic(): void {
    this.wantedTrack = null;
  }

  /**
   * Advance the fades by `elapsedMs` of wall time; called once a frame from
   * the game loop, never from a scene, so a fade survives the scene that
   * asked for it and runs at the same speed however fast the run clock goes.
   * A track starts from the top when it first rises from silence and stops
   * when it falls back to it.
   */
  stepMusic(elapsedMs: number): void {
    if (this.sound.locked) return;
    this.gains = stepMusicFade(this.gains, this.wantedTrack, elapsedMs, MUSIC_FADE_MS);
    for (const key of MUSIC_KEYS) {
      const track = this.tracks.get(key);
      if (!(key in this.gains)) {
        if (track && (track.isPlaying || track.isPaused)) track.stop();
        this.trackVolumes.delete(key);
        continue;
      }
      const sound = track ?? this.addTrack(key);
      if (sound && !sound.isPlaying && !sound.isPaused) {
        // `play` puts the sound back to the volume it was added with.
        sound.play();
        this.trackVolumes.delete(key);
      }
    }
    this.applyMusicVolumes();
  }

  private addTrack(key: MusicKey): Phaser.Sound.BaseSound | undefined {
    if (!this.cache.exists(key)) {
      this.warnOnce(key, `track "${key}" is not loaded; skipping`);
      return undefined;
    }
    try {
      const sound = this.sound.add(key, { loop: true, volume: 0 });
      this.tracks.set(key, sound);
      return sound;
    } catch (error) {
      this.warnOnce(key, `track "${key}" failed to load: ${String(error)}`);
      return undefined;
    }
  }

  /**
   * Re-apply every track's volume, so a setting change is heard at once. Only
   * a changed volume is set: each set is an automation event on the Web Audio
   * gain, and a track holds still for most of a run.
   */
  private applyMusicVolumes(): void {
    for (const [key, sound] of this.tracks) {
      const volume = musicVolume(this.current, this.gains[key] ?? 0, MUSIC[key].volume);
      if (this.trackVolumes.get(key) === volume) continue;
      this.trackVolumes.set(key, volume);
      (sound as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(volume);
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
 * the listener sits on the document. Music fades are stepped from the game's
 * own loop for the same reason: it outlives every scene. Called once, from Boot.
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
  scene.game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) =>
    audio.stepMusic(delta),
  );
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
