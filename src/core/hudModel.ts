import { SLOT_UNLOCK_LEVELS } from '../config/loadout';
import type { LoadoutPassiveView, LoadoutSpellView, RunEvent, RunPhase } from './runEvents';

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
  /** #195: Embers collected this run. */
  embers: number;
  phase: RunPhase;
  bossHp: number;
  bossMaxHp: number;
  /** #134: the absorption pool the run's shields hold, and what they hold at full. */
  shield: number;
  shieldMax: number;
  /** #144: the spells casting, default first, and the passives held. */
  spells: readonly LoadoutSpellView[];
  passives: readonly LoadoutPassiveView[];
}

/** One slot box on the HUD: a spell casting in it, or why it is empty (spec §10). */
export type SlotRow =
  | { kind: 'spell'; name: string; color: number; progress: number | null }
  | { kind: 'open' }
  | { kind: 'locked'; unlockLevel: number };

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
  embers: 0,
  phase: 'waves',
  bossHp: 0,
  bossMaxHp: 0,
  shield: 0,
  shieldMax: 0,
  spells: [],
  passives: [],
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
    case 'shield':
      return { ...model, shield: event.payload.pool, shieldMax: event.payload.max };
    case 'loadout':
      return { ...model, spells: event.payload.spells, passives: event.payload.passives };
    case 'embers':
      return { ...model, embers: event.payload.embers };
  }
}

/**
 * The slot boxes, top to bottom: every spell casting, then the slots still
 * empty — locked with the level that opens them, or open. Built from what is
 * casting rather than from the slots, so a `?loadout=` run, which casts its
 * extras without spending a slot, still shows them; a run past three spells
 * gets a box for each.
 */
export function slotRows(model: Readonly<HudModel>): SlotRow[] {
  const rows: SlotRow[] = model.spells.map(({ name, color, progress }) => ({
    kind: 'spell',
    name,
    color,
    progress,
  }));
  // Row 0 is the default spell's, which is always equipped; it is only empty
  // before the first loadout event lands.
  for (const unlockLevel of [1, ...SLOT_UNLOCK_LEVELS].slice(rows.length)) {
    rows.push(model.level >= unlockLevel ? { kind: 'open' } : { kind: 'locked', unlockLevel });
  }
  return rows;
}

/** What a slot box says. */
export function slotLabel(row: Readonly<SlotRow>): string {
  if (row.kind === 'spell') return row.name;
  if (row.kind === 'open') return 'Open';
  return `Locked · Lv ${row.unlockLevel}`;
}

/** One line per passive, in the order taken, each with its rank (spec §10). */
export function passiveLines(model: Readonly<HudModel>): string[] {
  return model.passives.map(({ name, rank }) => `${name} ×${rank}`);
}

/** The shield bar exists only while the run has a shield equipped (#134). */
export function shieldBarVisible(model: Readonly<HudModel>): boolean {
  return model.shieldMax > 0;
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
