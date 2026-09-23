import type { Passive } from './passives';

/**
 * Meta progression (CO-101): what the currency buys and the milestones that
 * gate content. The currency itself is picked up in the run (#195,
 * `config/pickups.ts`). Everything here outlives a run and is read by
 * `core/save.ts` and `core/upgrades.ts`.
 *
 * Pure data, no Phaser import.
 */

/** The soft currency's display name. */
export const CURRENCY_NAME = 'Embers';

/** Lifetime counters a milestone may test. Mirrors `SaveProfile` in `core/save.ts`. */
export type MilestoneStat = 'runs' | 'wins' | 'bestLevel' | 'totalKills';

/** Met once the named counter reaches `atLeast`; never lost again. */
export interface Milestone {
  id: string;
  name: string;
  description: string;
  stat: MilestoneStat;
  atLeast: number;
}

const MILESTONE_LIST = [
  {
    id: 'milestone_first_run',
    name: 'First Blood',
    description: 'Finish one run.',
    stat: 'runs',
    atLeast: 1,
  },
  {
    id: 'milestone_first_win',
    name: 'Boss Slayer',
    description: 'Win one run.',
    stat: 'wins',
    atLeast: 1,
  },
  {
    id: 'milestone_veteran',
    name: 'Veteran',
    description: 'Finish ten runs.',
    stat: 'runs',
    atLeast: 10,
  },
  {
    id: 'milestone_reaper',
    name: 'Reaper',
    description: 'Kill 1,000 enemies in total.',
    stat: 'totalKills',
    atLeast: 1000,
  },
] as const satisfies readonly Milestone[];

export type MilestoneId = (typeof MILESTONE_LIST)[number]['id'];

export const MILESTONES: readonly Milestone[] = MILESTONE_LIST;

/**
 * A permanent upgrade: one `{field, op, amount}` change per rank, exactly a
 * passive's shape so `resolveProfile` applies it with the same rules. Every
 * upgrade caps — it applies to every run forever, so an uncapped one would end
 * the game's difficulty. Rank `r` (0-based, the rank being bought) costs
 * `baseCost + costStep × r`. `requires` gates the upgrade behind a milestone.
 */
export interface Upgrade extends Passive {
  maxRank: number;
  baseCost: number;
  costStep: number;
  requires?: MilestoneId;
}

const UPGRADE_LIST = [
  {
    id: 'upgrade_vigor',
    name: 'Vigor',
    description: '+10 max HP every run.',
    field: 'maxHp',
    op: 'add',
    amount: 10,
    maxRank: 5,
    baseCost: 100,
    costStep: 50,
  },
  {
    id: 'upgrade_might',
    name: 'Might',
    description: 'Every spell deals 5% more damage.',
    field: 'damageMul',
    op: 'mul',
    amount: 1.05,
    maxRank: 5,
    baseCost: 120,
    costStep: 60,
  },
  {
    id: 'upgrade_alacrity',
    name: 'Alacrity',
    description: 'Every spell cools down 4% faster.',
    field: 'cooldownMul',
    op: 'mul',
    amount: 0.96,
    maxRank: 5,
    baseCost: 120,
    costStep: 60,
  },
  {
    id: 'upgrade_fleet',
    name: 'Fleet',
    description: 'Move 4% faster.',
    field: 'moveSpeed',
    op: 'mul',
    amount: 1.04,
    maxRank: 3,
    baseCost: 80,
    costStep: 40,
  },
  {
    id: 'upgrade_fortune',
    name: 'Fortune',
    description: 'Gain 6% more XP.',
    field: 'xpGain',
    op: 'mul',
    amount: 1.06,
    maxRank: 5,
    baseCost: 100,
    costStep: 50,
  },
  {
    id: 'upgrade_bulwark',
    name: 'Bulwark',
    description: 'Take 2% less damage. Unlocked by your first win.',
    field: 'damageReduction',
    op: 'add',
    amount: 0.02,
    maxRank: 5,
    baseCost: 200,
    costStep: 100,
    requires: 'milestone_first_win',
  },
] as const satisfies readonly Upgrade[];

export type UpgradeId = (typeof UPGRADE_LIST)[number]['id'];

export const UPGRADES: readonly Upgrade[] = UPGRADE_LIST;

export function upgradeById(id: string): Upgrade | undefined {
  return UPGRADES.find((upgrade) => upgrade.id === id);
}

export function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === 'string' && UPGRADES.some((upgrade) => upgrade.id === value);
}
