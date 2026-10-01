import { CURRENCY_NAME } from '../config/meta';
import { ROSTER_SPELL_CARDS } from '../config/rosterCards';
import { SPELL_CARDS, SPELL_IDS, type SpellId } from '../config/spells';
import { formatTimer } from './hudModel';
import type { SaveProfile } from './save';
import { pauseView, type PauseItem, type PauseView } from './pauseModel';
import type { Outcome, ResultPayload } from './scenePayloads';

/**
 * View-model behind the result screen (CO-014, #290): the outcome headline,
 * the run's build as the pause screen's tiles, the formatted stat rows, and
 * the fixed places ResultScene draws them. Pure TS, unit-tested; the scene
 * only draws what it is given where it is told.
 */

export interface ResultHeadline {
  text: string;
  /** CSS colour for the headline text. */
  color: string;
  subtitle: string;
}

export const RESULT_HEADLINES: Readonly<Record<Outcome, ResultHeadline>> = {
  win: { text: 'Victory', color: '#ffd700', subtitle: 'The boss falls and the onslaught ends.' },
  lose: { text: 'Defeat', color: '#dc143c', subtitle: 'The crimson tide overran you.' },
  ended: {
    text: 'Run ended',
    color: '#cccccc',
    subtitle: 'You left the field with what you gathered.',
  },
};

/** `[label, value]`, shown in order. */
export type StatRow = readonly [label: string, value: string];

/** Keys that confirm a result button (the main and numpad Enter both report `Enter`). */
export function isConfirmKey(key: string): boolean {
  return key === 'Enter';
}

/** Non-negative whole number with thousands separators; anything non-finite reads 0. */
function formatCount(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return n.toLocaleString('en-US');
}

/**
 * The stats card beside the hero: how long the run lasted, what it killed and
 * what it banked (CO-101; since #195 exactly the Embers it collected). The
 * level is on the hero's badge and the spells are in their strip.
 */
export function resultRows(
  payload: Pick<ResultPayload, 'stats' | 'earned' | 'balance'>,
): StatRow[] {
  return [
    ['Time survived', formatTimer(payload.stats.timeSurvivedMs)],
    ['Kills', formatCount(payload.stats.kills)],
    [`${CURRENCY_NAME} collected`, formatCount(payload.earned)],
    [`${CURRENCY_NAME} total`, formatCount(payload.balance)],
  ];
}

/** What the result screen shows (#290): the headline, the hero and the run's build as tiles. */
export interface ResultView {
  headline: ResultHeadline;
  /** A lost run's hero stands greyed out. */
  fallen: boolean;
  level: string;
  spells: PauseView['spells'];
  passives: readonly PauseItem[];
  relics: readonly PauseItem[];
  rows: StatRow[];
}

export function resultView(payload: Readonly<ResultPayload>): ResultView {
  const { outcome, stats, build } = payload;
  // The pause screen's tiles, so both screens name and letter them alike.
  const tiles = pauseView({
    level: stats.level,
    // The payload carries no descriptions; the info line reads them from the
    // roster by id, which `isRunBuild` has already allow-listed (CO-198).
    spells: build.spells.map((spell) => ({
      ...spell,
      description: ROSTER_SPELL_CARDS[spell.id]?.description ?? '',
    })),
    passives: new Map(build.passives),
    relics: new Map(build.relics),
    kills: stats.kills,
    embers: stats.embers,
    elapsedMs: stats.timeSurvivedMs,
  });
  return {
    headline: RESULT_HEADLINES[outcome],
    fallen: outcome === 'lose',
    level: formatCount(stats.level),
    spells: tiles.spells,
    passives: tiles.passives,
    relics: tiles.relics,
    rows: resultRows(payload),
  };
}

/** An empty strip on the result screen; the pause screen's says "None yet". */
export const RESULT_EMPTY_TEXT = 'None taken';

/** A box on the 960×540 screen: its top-left corner and size. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where everything sits (#290), fixed whatever the build: the headline on
 * top, the hero and stats card on the left, the three strips on the right and
 * "Play again" and "Main menu" with their hint at the bottom. Nothing moves
 * with the content, so a long run can never push the buttons off the screen.
 */
export const RESULT_LAYOUT = {
  headlineY: 42,
  subtitleY: 84,
  card: { x: 36, y: 108, width: 252, height: 280 },
  pedestalY: 220,
  /** The stats card's rows: labels from `x`, values right-aligned to `valueX`. */
  rows: { x: 54, valueX: 272, y: 282, pitch: 28 },
  spells: { x: 308, y: 108, width: 616, height: 64 },
  passives: { x: 308, y: 184, width: 616, height: 96 },
  relics: { x: 308, y: 292, width: 616, height: 96 },
  /** Where a strip's contents start, right of its label. */
  contentInset: 104,
  /**
   * The info line for the pointed-at or selected item (CO-198): up to two
   * lines, centred in the box. Two CI-height lines (about 21 px each) still
   * fit; anything taller hangs from the top, clear of the strips.
   */
  info: { x: 36, y: 392, width: 888, height: 44 },
  /**
   * "Play again", and "Main menu" beside it (CO-218): 24 px apart, so neither's
   * focus ring reaches the other.
   */
  button: { x: 248, y: 444, width: 220, height: 34 },
  menuButton: { x: 492, y: 444, width: 220, height: 34 },
  hintY: 500,
  /** The save-failed line (#316), under the hint; 24 px clears two CI-height 14 px lines. */
  saveNoticeY: 524,
} as const;

/** A strip's tiles: `TILE_PITCH` apart in rows `TILE_ROW_PITCH` apart, `TILE_ROWS` rows at most. */
const TILE_PITCH = 48;
const TILE_ROW_PITCH = 44;
export const TILE_ROWS = 2;
/** A tile's half height, its disc and the badge under it: what must stay inside its strip. */
export const TILE_REACH = 22;
/** The first row's centre, under the strip's top edge. */
const TILE_TOP = 26;
/** A spell's slot: an icon with its name to the right, or the icon alone when squeezed. */
export const SPELL_PITCH = 150;
const SPELL_ICON = 32;

/** Tile centres in a strip, plus how many tiles did not fit. */
export interface TileGrid {
  slots: readonly { x: number; y: number }[];
  /**
   * Tiles past the strip's room. When non-zero the last slot holds a "+N"
   * marker instead of a tile, so `slots.length - 1 + overflow` is the count.
   */
  overflow: number;
}

export function tilesPerRow(strip: Box): number {
  return Math.floor((strip.width - RESULT_LAYOUT.contentInset - 8) / TILE_PITCH);
}

/**
 * Lays `count` tiles out in `strip` in rows that wrap and never grow it. A
 * build too big for its rows keeps every row but the last slot, which says
 * how many more there are.
 */
export function tileGrid(count: number, strip: Box): TileGrid {
  const perRow = tilesPerRow(strip);
  const room = perRow * TILE_ROWS;
  const n = Math.max(0, Math.floor(count));
  const shown = n > room ? room : n;
  const slots = Array.from({ length: shown }, (_, i) => ({
    x: strip.x + RESULT_LAYOUT.contentInset + SPELL_ICON / 2 + (i % perRow) * TILE_PITCH,
    y: strip.y + TILE_TOP + Math.floor(i / perRow) * TILE_ROW_PITCH,
  }));
  return { slots, overflow: n > room ? n - (room - 1) : 0 };
}

/** Spell icon centres in their strip; names show only at the full pitch. */
export function spellSlots(count: number): { xs: number[]; y: number; named: boolean } {
  const strip = RESULT_LAYOUT.spells;
  const room = strip.width - RESULT_LAYOUT.contentInset - 8 - SPELL_ICON;
  const n = Math.max(0, Math.floor(count));
  const pitch = n <= 1 ? SPELL_PITCH : Math.min(SPELL_PITCH, room / (n - 1));
  const x0 = strip.x + RESULT_LAYOUT.contentInset + SPELL_ICON / 2;
  return {
    xs: Array.from({ length: n }, (_, i) => x0 + i * pitch),
    y: strip.y + strip.height / 2,
    named: pitch === SPELL_PITCH,
  };
}

/**
 * The spell the most runs started with, or `null` before any run. A tie goes
 * to the spell listed first on spell select; ids this build has no card for
 * (a spell since removed) are skipped.
 */
export function mostPlayedSpell(spellCounts: Readonly<Record<string, number>>): SpellId | null {
  let best: SpellId | null = null;
  for (const spellId of SPELL_IDS) {
    const count = spellCounts[spellId] ?? 0;
    if (count > 0 && (best === null || count > (spellCounts[best] ?? 0))) best = spellId;
  }
  return best;
}

/**
 * Lifetime totals for the profile panel (#121), formatted the way the result
 * screen formats one run's stats. Empty before the first run, so the panel can
 * say so instead of showing a column of zeroes.
 */
export function profileRows(profile: Readonly<SaveProfile>): StatRow[] {
  if (profile.runs <= 0) return [];
  const spell = mostPlayedSpell(profile.spellCounts);
  return [
    ['Runs played', formatCount(profile.runs)],
    ['Best time survived', formatTimer(profile.bestTimeMs)],
    ['Best level', formatCount(profile.bestLevel)],
    ['Total kills', formatCount(profile.totalKills)],
    ['Most played spell', spell ? SPELL_CARDS[spell].name : 'none'],
  ];
}
