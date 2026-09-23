import { CURRENCY_NAME } from '../config/meta';
import { SPELL_CARDS, SPELL_IDS, type SpellId } from '../config/spells';
import { formatTimer } from './hudModel';
import type { SaveProfile } from './save';
import type { Outcome, ResultPayload, RunStats } from './scenePayloads';

/**
 * View-model behind the result screen (CO-014): the outcome headline and the
 * formatted stat rows ResultScene draws. Pure TS, unit-tested; the scene only
 * lays the strings out.
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
};

/** `[label, value]`, shown in order. */
export type StatRow = readonly [label: string, value: string];

/** Keys that confirm "Play again" (the main and numpad Enter both report `Enter`). */
export function isConfirmKey(key: string): boolean {
  return key === 'Enter';
}

/** Non-negative whole number with thousands separators; anything non-finite reads 0. */
function formatCount(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return n.toLocaleString('en-US');
}

/**
 * Upgrades in pick order, repeats collapsed into `name ×n` (a passive taken at
 * several ranks appears once). Empty list reads `none`.
 */
export function summarizePerks(perks: readonly string[]): string {
  if (perks.length === 0) return 'none';
  const counts = new Map<string, number>();
  for (const perk of perks) counts.set(perk, (counts.get(perk) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}

export function resultRows(stats: RunStats): StatRow[] {
  return [
    ['Time survived', formatTimer(stats.timeSurvivedMs)],
    ['Level', formatCount(stats.level)],
    ['Kills', formatCount(stats.kills)],
    ['Spell', SPELL_CARDS[stats.spellId].name],
    ['Upgrades taken', summarizePerks(stats.perks)],
  ];
}

/**
 * What the run paid and where the balance stands (CO-101), under the stat rows.
 * `earned` is shown with a leading `+` so it reads as a payout, not a total.
 */
export function rewardRows(payload: Pick<ResultPayload, 'earned' | 'balance'>): StatRow[] {
  return [
    [`${CURRENCY_NAME} earned`, `+${formatCount(payload.earned)}`],
    [`${CURRENCY_NAME} total`, formatCount(payload.balance)],
  ];
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
