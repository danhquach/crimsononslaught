import { MILESTONES, UPGRADES, upgradeById, type Milestone, type Upgrade } from '../config/meta';
import { validatePassives } from './playerProfile';
import type { Save, SaveProfile } from './save';

/**
 * The permanent upgrade shop and the milestones that gate it (CO-101): what a
 * rank costs, whether the player may buy it, and the new save when they do.
 *
 * Upgrades reach a run through the loadout — `buildLoadout(element, ranks)`
 * folds them into the same `resolveProfile` pass as the run's passives, so
 * they are part of the profile before the first cast and involve no RNG. The
 * same seed and the same save give the same run.
 *
 * Pure TS, no Phaser import.
 */

/** Why a purchase was refused. */
export type BuyRejection = 'unknown-upgrade' | 'locked' | 'max-rank' | 'cannot-afford';

export type BuyResult =
  | { readonly ok: true; readonly save: Save }
  | { readonly ok: false; readonly reason: BuyRejection };

/** Ranks owned, as `resolveProfile` reads them. Ranks of 0 are left out. */
export function upgradeRanks(save: Save): ReadonlyMap<string, number> {
  return new Map(Object.entries(save.upgrades).filter(([, rank]) => rank > 0));
}

export function upgradeRank(save: Save, upgradeId: string): number {
  return save.upgrades[upgradeId] ?? 0;
}

/** Cost of buying the rank after `owned` ranks: `baseCost + costStep × owned`. */
export function upgradeCost(upgrade: Upgrade, owned: number): number {
  return upgrade.baseCost + upgrade.costStep * owned;
}

/** Cost of the player's next rank of `upgradeId`, or `undefined` at max rank. */
export function nextCost(save: Save, upgradeId: string): number | undefined {
  const upgrade = upgradeById(upgradeId);
  if (!upgrade) return undefined;
  const owned = upgradeRank(save, upgradeId);
  return owned >= upgrade.maxRank ? undefined : upgradeCost(upgrade, owned);
}

/** Milestones the profile has reached. Derived on read, never stored, so a counter can never lag its unlock. */
export function metMilestones(
  profile: SaveProfile,
  milestones: readonly Milestone[] = MILESTONES,
): Set<string> {
  const met = new Set<string>();
  for (const milestone of milestones) {
    if (profile[milestone.stat] >= milestone.atLeast) met.add(milestone.id);
  }
  return met;
}

/** False while the upgrade's `requires` milestone is unmet; upgrades without one are always open. */
export function isUnlocked(save: Save, upgrade: Upgrade): boolean {
  return upgrade.requires === undefined || metMilestones(save.profile).has(upgrade.requires);
}

/** `undefined` when the next rank may be bought, else why not. Checked in the order the shop shows them. */
export function canBuy(save: Save, upgradeId: string): BuyRejection | undefined {
  const upgrade = upgradeById(upgradeId);
  if (!upgrade) return 'unknown-upgrade';
  if (!isUnlocked(save, upgrade)) return 'locked';
  const owned = upgradeRank(save, upgradeId);
  if (owned >= upgrade.maxRank) return 'max-rank';
  if (save.currency < upgradeCost(upgrade, owned)) return 'cannot-afford';
  return undefined;
}

/** Buy one rank: spend the cost, own one more. Returns a new save; refuses with the `canBuy` reason. */
export function buyUpgrade(save: Save, upgradeId: string): BuyResult {
  const reason = canBuy(save, upgradeId);
  if (reason !== undefined) return { ok: false, reason };
  const upgrade = upgradeById(upgradeId) as Upgrade;
  const owned = upgradeRank(save, upgradeId);
  return {
    ok: true,
    save: {
      ...save,
      currency: save.currency - upgradeCost(upgrade, owned),
      upgrades: { ...save.upgrades, [upgradeId]: owned + 1 },
    },
  };
}

/**
 * Boot-time check of the meta config (spec §12 shape): every upgrade passes
 * the passive checks, caps, has a non-negative cost, and requires a milestone
 * that exists; milestone ids are unique and their thresholds positive. One line
 * per problem, never throws.
 */
export function validateMeta(
  upgrades: readonly Upgrade[] = UPGRADES,
  milestones: readonly Milestone[] = MILESTONES,
): string[] {
  const problems = validatePassives(upgrades).map((p) => p.replace(/^passive /, 'upgrade '));
  const milestoneIds = new Set<string>();
  for (const milestone of milestones) {
    if (milestoneIds.has(milestone.id)) problems.push(`duplicate milestone id "${milestone.id}"`);
    milestoneIds.add(milestone.id);
    if (!Number.isInteger(milestone.atLeast) || milestone.atLeast < 1) {
      problems.push(
        `milestone "${milestone.id}": atLeast must be an integer >= 1, got ${milestone.atLeast}`,
      );
    }
  }
  for (const upgrade of upgrades) {
    const where = `upgrade "${upgrade.id}"`;
    if (upgrade.baseCost < 0 || upgrade.costStep < 0) problems.push(`${where}: costs must be >= 0`);
    if (upgrade.requires !== undefined && !milestoneIds.has(upgrade.requires)) {
      problems.push(`${where}: requires unknown milestone "${upgrade.requires}"`);
    }
  }
  return problems;
}
