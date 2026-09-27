import { BOSS_TRACKS, RUN_TRACKS, type MusicKey } from '../config/sounds';
import { effectiveVolume, type AudioSettings } from './audioMix';
import type { Rng } from './rng';

/**
 * The music crossfade (CO-157), with no engine: how loud each track's fade
 * has it after some wall-clock time, given the one track that should be
 * heard, and which pair of tracks a run plays. `render/audio.ts` steps it
 * once a frame and multiplies in the volumes; nothing here touches Phaser,
 * the run clock or the run's RNG.
 *
 * Pure TS, no Phaser import.
 */

/** Fade gain per track in (0, 1]; a track that is not listed is silent. */
export type MusicGains = Readonly<Record<string, number>>;

/**
 * The most one step may advance a fade, ms. A frame after the tab was away,
 * or a stall, moves the fade a notch rather than jumping it to the end.
 */
export const MAX_FADE_STEP_MS = 250;

/**
 * The gains `elapsedMs` later. Every track but `target` falls, and `target`
 * rises, each at `1 / fadeMs` per ms, so a change of track is a crossfade of
 * `fadeMs` and a change of mind mid-fade carries on from where the gains are
 * instead of jumping. The rise is capped so the gains never sum above 1: two
 * tracks are never both at full volume. `target` null fades everything out.
 * A track that reaches 0 is dropped. The gains passed in are untouched.
 */
export function stepMusicFade(
  gains: MusicGains,
  target: string | null,
  elapsedMs: number,
  fadeMs: number,
): MusicGains {
  const dt = Number.isFinite(elapsedMs) ? Math.min(MAX_FADE_STEP_MS, Math.max(0, elapsedMs)) : 0;
  const rate = fadeMs > 0 ? dt / fadeMs : 1;
  const out: Record<string, number> = {};
  let others = 0;
  for (const [key, gain] of Object.entries(gains)) {
    if (key === target) continue;
    const next = Math.min(1, gain) - rate;
    if (next > 0) {
      out[key] = next;
      others += next;
    }
  }
  if (target !== null) {
    const next = Math.min(1, (gains[target] ?? 0) + rate, 1 - others);
    if (next > 0) out[target] = next;
  }
  return out;
}

/**
 * The volume a track plays at: its fade gain × master × music × its own gain,
 * or 0 when muted, so mute and the sliders act on the very next frame
 * whatever the fade is doing.
 */
export function musicVolume(
  settings: Readonly<AudioSettings>,
  fadeGain: number,
  trackVolume: number,
): number {
  return effectiveVolume(settings, 'music', trackVolume) * Math.min(1, Math.max(0, fadeGain));
}

/**
 * The label `render/audio.ts` derives the music's own RNG stream from, off
 * the clock: the run seed never picks a track, so `?seed=` replays the same
 * run whatever plays over it, and a replayed seed still hears a new pair.
 */
export const MUSIC_STREAM = 'music';

/** The tracks one run plays: `run` through the waves, `boss` once the boss is in. */
export interface RunMusic {
  readonly run: MusicKey;
  readonly boss: MusicKey;
}

/** A run's pair, one run track and one boss track, each drawn from `rng`. */
export function pickRunMusic(rng: Rng): RunMusic {
  return { run: rng.pick(RUN_TRACKS), boss: rng.pick(BOSS_TRACKS) };
}
