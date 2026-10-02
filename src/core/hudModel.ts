import { BOSS_BAR_COLORS } from '../config/hud';
import { SLOT_UNLOCK_LEVELS } from '../config/loadout';
import { MAX_SPELL_LEVEL } from '../config/spellLevels';
import { badgeText } from './maxRank';
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
  /** #384: the dash's cooldown share run (0 to 1) and whether it is ready. */
  dash: { progress: number; ready: boolean };
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
      /** Picks the icon art (CO-154) via `spellIconArt`. */
      id: string;
      name: string;
      /** The name cut to fit under the icon. */
      label: string;
      /** Stands in for the icon art when there is none, or no atlas: the name's initials. */
      glyph: string;
      color: number;
      ready: boolean;
      waiting: number;
      badge: string | null;
      /** #326: the spell's level, whether it is at the top one, and the text its pill reads (`1`, `2`, `MAX`). */
      level: number;
      maxed: boolean;
      levelBadge: string;
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
  dash: { progress: 1, ready: true },
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
    case 'dash':
      return { ...model, dash: { progress: event.payload.progress, ready: event.payload.ready } };
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
  const rows: SlotRow[] = model.spells.map(({ id, name, color, progress, secondsLeft, level }) => {
    const waiting = progress === null ? 0 : 1 - fraction(progress, 1);
    const maxed = level >= MAX_SPELL_LEVEL;
    return {
      kind: 'spell',
      id,
      name,
      label: shortSpellName(name),
      glyph: spellGlyph(name),
      color,
      ready: waiting === 0,
      waiting,
      badge: waiting > 0 ? cooldownBadge(secondsLeft) : null,
      level,
      maxed,
      levelBadge: badgeText(level, maxed),
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

/**
 * CO-195: the HP bar with the shield drawn on it. The red fill is HP and the
 * ice segment right after it is the shield, both as shares of the bar. While a
 * shield is up the bar stands for whichever is more, max HP or HP plus the
 * shield, so a shield on full HP shrinks the red a little rather than running
 * off the end; as the shield drains the bar eases back to max HP, with no jump
 * when it breaks. With no shield up the bar is HP alone.
 */
export interface HpBarView {
  hp: number;
  shield: number;
  /** `HP 70 / 100`, or `HP 70` while a shield is up. */
  hpText: string;
  /** `+20` while a shield is up, drawn in the shield's colour after `hpText`; '' otherwise. */
  shieldText: string;
}

export function hpBarView(model: Readonly<HudModel>): HpBarView {
  const hp = Math.ceil(model.hp);
  const up = model.shieldMax > 0 && model.shield > 0;
  if (!up) {
    return {
      hp: fraction(model.hp, model.maxHp),
      shield: 0,
      hpText: `HP ${hp} / ${model.maxHp}`,
      shieldText: '',
    };
  }
  const span = Math.max(model.maxHp, Math.max(0, model.hp) + model.shield);
  const hpShare = fraction(model.hp, span);
  return {
    hp: hpShare,
    shield: Math.min(1 - hpShare, fraction(model.shield, span)),
    hpText: `HP ${hp}`,
    shieldText: `+${Math.ceil(model.shield)}`,
  };
}

/** The boss bar exists only during the boss phase (ticket CO-012). */
export function bossBarVisible(model: Readonly<HudModel>): boolean {
  return model.phase === 'boss';
}

/**
 * #387: the boss bar as stacked layers. `maxHp` is split into `bars` equal
 * bars; `left` is how many are still alive (the one being worn down included),
 * `fill01` is how full that one is, and `bar` is its place in the order shown,
 * 0 first. No HP left reads left 0, an empty last bar and no count.
 */
export interface BossBarLayers {
  bar: number;
  fill01: number;
  left: number;
  countText: string;
}

/** Float noise below this, in bar units, is not part of a bar: 7200 + 1e-9 HP still reads one full bar. */
const BAR_UNIT_EPSILON = 1e-6;

export function bossBarLayers(hp: number, maxHp: number, bars: number): BossBarLayers {
  const count = Number.isFinite(bars) && bars >= 1 ? Math.floor(bars) : 1;
  const spent: BossBarLayers = { bar: count - 1, fill01: 0, left: 0, countText: '' };
  if (!Number.isFinite(maxHp) || maxHp <= 0 || !Number.isFinite(hp) || hp <= 0) return spent;
  const units = (Math.min(hp, maxHp) * count) / maxHp;
  const left = Math.max(1, Math.ceil(units - BAR_UNIT_EPSILON));
  const fill01 = Math.min(1, Math.max(0, units - (left - 1)));
  return { bar: count - left, fill01, left, countText: `\u00d7${left}` };
}

/** #387: whether a hit took a bar off the boss: fewer bars left than before, and still some left (the killing blow is the death cue's). */
export function bossBarBroke(prevLeft: number | null, nextLeft: number): boolean {
  return prevLeft !== null && nextLeft < prevLeft && nextLeft > 0;
}

/** #387: the fill colour of bar `bar` (0 first) of `bars`: violet, then amber for any between, red last. */
export function bossBarColor(bar: number, bars: number): number {
  if (bar >= bars - 1) return BOSS_BAR_COLORS.last;
  return bar <= 0 ? BOSS_BAR_COLORS.first : BOSS_BAR_COLORS.middle;
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
