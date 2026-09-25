import type { FrameName } from '../config/frames';
import { SLOT_UNLOCK_LEVELS } from '../config/loadout';
import { spellIconFrame } from '../config/spellIcons';
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

/**
 * One slot icon on the HUD (#213): a spell casting in it, or why it is empty
 * (spec §10). A spell's `waiting` is the share of its cooldown still to run —
 * the dark wedge over the icon, 1 right after a cast and 0 when ready — and
 * `badge` the whole seconds left, `null` when ready or under a second. A spell
 * with no cooldown (an orbit, a shield) is always ready.
 */
export type SlotRow =
  | {
      kind: 'spell';
      name: string;
      /** The name cut to fit under the icon. */
      label: string;
      /** The icon art (CO-154), `null` for a spell with none yet. */
      icon: FrameName | null;
      /** Stands in for `icon` when there is none, or no atlas: the name's initials. */
      glyph: string;
      color: number;
      ready: boolean;
      waiting: number;
      badge: string | null;
    }
  | { kind: 'open' }
  | { kind: 'locked'; unlockLevel: number };

/** The longest label that fits under a slot icon, in characters. */
export const SLOT_LABEL_MAX = 10;

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
 * The slot icons, in slot order: every spell casting, then the slots still
 * empty — locked with the level that opens them, or open. Built from what is
 * casting rather than from the slots, so a `?loadout=` run, which casts its
 * extras without spending a slot, still shows them; a run past three spells
 * gets an icon for each.
 */
export function slotRows(model: Readonly<HudModel>): SlotRow[] {
  const rows: SlotRow[] = model.spells.map(({ id, name, color, progress, secondsLeft }) => {
    const waiting = progress === null ? 0 : 1 - fraction(progress, 1);
    return {
      kind: 'spell',
      name,
      label: shortSpellName(name),
      icon: spellIconFrame(id) ?? null,
      glyph: spellGlyph(name),
      color,
      ready: waiting === 0,
      waiting,
      badge: waiting > 0 ? cooldownBadge(secondsLeft) : null,
    };
  });
  // Row 0 is the default spell's, which is always equipped; it is only empty
  // before the first loadout event lands.
  for (const unlockLevel of [1, ...SLOT_UNLOCK_LEVELS].slice(rows.length)) {
    rows.push(model.level >= unlockLevel ? { kind: 'open' } : { kind: 'locked', unlockLevel });
  }
  return rows;
}

/** What a slot says under its icon. */
export function slotLabel(row: Readonly<SlotRow>): string {
  if (row.kind === 'spell') return row.label;
  if (row.kind === 'open') return 'Open';
  return `Lv ${row.unlockLevel}`;
}

/**
 * A name short enough to sit under its icon: whole if it fits, else its last
 * word ("Fire Wave" → "Wave"), which is still unique within one element's
 * roster, cut with an ellipsis only if even that is too long.
 */
export function shortSpellName(name: string): string {
  if (name.length <= SLOT_LABEL_MAX) return name;
  const last = name.trim().split(/\s+/).pop() ?? name;
  return last.length <= SLOT_LABEL_MAX ? last : `${last.slice(0, SLOT_LABEL_MAX - 1)}…`;
}

/** The icon's placeholder glyph: the first letters of the name's first two words. */
export function spellGlyph(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * The seconds-left badge: whole seconds, floored, so it counts 2, 1 and then
 * disappears for the last second rather than flickering on fast spells.
 */
export function cooldownBadge(secondsLeft: number | null): string | null {
  if (secondsLeft === null || !Number.isFinite(secondsLeft) || secondsLeft < 1) return null;
  return String(Math.floor(secondsLeft));
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
