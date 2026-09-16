import type { RunEvent, RunPhase } from './runEvents';

/**
 * View-model behind the HUD overlay: everything HudScene draws, reduced from
 * `RunEvent`s. Keeping the reduction and formatting here (pure, unit-tested)
 * leaves HudScene as a thin renderer.
 */
export interface HudModel {
  elapsedMs: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  kills: number;
  phase: RunPhase;
  bossHp: number;
  bossMaxHp: number;
}

/**
 * Run-start values (spec §5). `xpToNext` starts at 0 so the XP bar is empty
 * until RunState reports the first threshold; the curve itself lives in CO-031.
 */
export const INITIAL_HUD: Readonly<HudModel> = {
  elapsedMs: 0,
  hp: 100,
  maxHp: 100,
  xp: 0,
  xpToNext: 0,
  level: 1,
  kills: 0,
  phase: 'waves',
  bossHp: 0,
  bossMaxHp: 0,
};

/** Returns a new model with the event applied; the input is never mutated. */
export function applyRunEvent(model: Readonly<HudModel>, event: RunEvent): HudModel {
  switch (event.name) {
    case 'timer':
      return { ...model, elapsedMs: event.payload.elapsedMs };
    case 'hp':
      return { ...model, hp: event.payload.hp, maxHp: event.payload.maxHp };
    case 'xp':
      // The xp payload (`xp`, `xpToNext`, `level`) is deliberately shaped 1:1 with the model.
      return { ...model, ...event.payload };
    case 'kill':
      return { ...model, kills: event.payload.kills };
    case 'phase':
      return { ...model, phase: event.payload.phase };
    case 'bossHp':
      return { ...model, bossHp: event.payload.hp, bossMaxHp: event.payload.maxHp };
  }
}

/** The boss bar exists only during the boss phase (ticket CO-012). */
export function bossBarVisible(model: Readonly<HudModel>): boolean {
  return model.phase === 'boss';
}

/** `m:ss`, floored to whole seconds; anything negative or non-finite reads 0:00. */
export function formatTimer(elapsedMs: number): string {
  const totalSeconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Bar fill in [0, 1]; a non-positive or NaN max means "nothing to show" (0). */
export function fraction(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}
