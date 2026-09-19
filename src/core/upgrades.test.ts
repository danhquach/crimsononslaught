import { describe, expect, it } from 'vitest';
import { MILESTONES, UPGRADES, upgradeById, type Milestone, type Upgrade } from '../config/meta';
import { BASE_PLAYER_PROFILE } from '../config/passives';
import { buildLoadout, profileOf, takePassive } from './loadout';
import { emptySave, type Save } from './save';
import {
  buyUpgrade,
  canBuy,
  isUnlocked,
  metMilestones,
  nextCost,
  upgradeCost,
  upgradeRanks,
  validateMeta,
} from './upgrades';

const vigor = upgradeById('upgrade_vigor') as Upgrade;
const bulwark = upgradeById('upgrade_bulwark') as Upgrade;

const rich = (currency: number, upgrades: Record<string, number> = {}): Save => ({
  ...emptySave(),
  currency,
  upgrades,
});

describe('upgradeCost / nextCost', () => {
  it('climbs by costStep per rank owned', () => {
    expect(upgradeCost(vigor, 0)).toBe(vigor.baseCost);
    expect(upgradeCost(vigor, 3)).toBe(vigor.baseCost + 3 * vigor.costStep);
  });

  it('is undefined at max rank or for an unknown id', () => {
    expect(nextCost(rich(0), 'upgrade_vigor')).toBe(vigor.baseCost);
    expect(nextCost(rich(0, { upgrade_vigor: vigor.maxRank }), 'upgrade_vigor')).toBeUndefined();
    expect(nextCost(rich(0), 'upgrade_nope')).toBeUndefined();
  });
});

describe('metMilestones / isUnlocked', () => {
  it('derives met milestones from the profile counters', () => {
    expect(metMilestones(emptySave().profile).size).toBe(0);
    const met = metMilestones({ ...emptySave().profile, runs: 10, wins: 1 });
    expect([...met].sort()).toEqual(
      ['milestone_first_run', 'milestone_first_win', 'milestone_veteran'].sort(),
    );
  });

  it('gates an upgrade behind its milestone and leaves the rest open', () => {
    expect(isUnlocked(emptySave(), vigor)).toBe(true);
    expect(isUnlocked(emptySave(), bulwark)).toBe(false);
    const winner: Save = { ...emptySave(), profile: { ...emptySave().profile, wins: 1 } };
    expect(isUnlocked(winner, bulwark)).toBe(true);
  });
});

describe('canBuy / buyUpgrade', () => {
  it('refuses in shop order: unknown, locked, max rank, cannot afford', () => {
    expect(canBuy(rich(10_000), 'upgrade_nope')).toBe('unknown-upgrade');
    expect(canBuy(rich(10_000), 'upgrade_bulwark')).toBe('locked');
    expect(canBuy(rich(10_000, { upgrade_vigor: vigor.maxRank }), 'upgrade_vigor')).toBe(
      'max-rank',
    );
    expect(canBuy(rich(vigor.baseCost - 1), 'upgrade_vigor')).toBe('cannot-afford');
    expect(canBuy(rich(vigor.baseCost), 'upgrade_vigor')).toBeUndefined();
  });

  it('spends the cost and adds a rank, leaving the old save alone', () => {
    const before = rich(vigor.baseCost + 7);
    const snapshot = structuredClone(before);
    const result = buyUpgrade(before, 'upgrade_vigor');
    expect(result).toEqual({
      ok: true,
      save: { ...before, currency: 7, upgrades: { upgrade_vigor: 1 } },
    });
    expect(before).toEqual(snapshot);
  });

  it('charges the higher price for the next rank', () => {
    const first = buyUpgrade(rich(1000), 'upgrade_vigor');
    if (!first.ok) throw new Error(first.reason);
    const second = buyUpgrade(first.save, 'upgrade_vigor');
    if (!second.ok) throw new Error(second.reason);
    expect(second.save.currency).toBe(1000 - upgradeCost(vigor, 0) - upgradeCost(vigor, 1));
    expect(second.save.upgrades.upgrade_vigor).toBe(2);
  });

  it('refuses and changes nothing when it cannot buy', () => {
    expect(buyUpgrade(rich(0), 'upgrade_vigor')).toEqual({ ok: false, reason: 'cannot-afford' });
  });
});

describe('upgrades reach the run profile', () => {
  it('a fresh save changes nothing', () => {
    expect(profileOf(buildLoadout('fire', upgradeRanks(emptySave())))).toEqual(BASE_PLAYER_PROFILE);
  });

  it('applies bought ranks before any passive, with passive rules', () => {
    const save = rich(0, { upgrade_vigor: 2, upgrade_might: 1 });
    const loadout = buildLoadout('fire', upgradeRanks(save));
    const profile = profileOf(loadout);
    expect(profile.maxHp).toBe(BASE_PLAYER_PROFILE.maxHp + 2 * vigor.amount);
    expect(profile.damageMul).toBeCloseTo(1.05);

    // An upgrade's mul and a passive's mul on one field multiply, like two passives.
    const withPower = profileOf(takePassive(loadout, 'passive_power'));
    expect(withPower.damageMul).toBeCloseTo(1.05 * 1.1);
  });

  it('is deterministic: the same save gives the same profile', () => {
    const save = rich(0, { upgrade_fleet: 3, upgrade_fortune: 5 });
    const a = profileOf(buildLoadout('ice', upgradeRanks(save)));
    const b = profileOf(buildLoadout('ice', upgradeRanks(structuredClone(save))));
    expect(a).toEqual(b);
  });

  it('drops zero ranks so resolveProfile never sees them', () => {
    expect([...upgradeRanks(rich(0, { upgrade_vigor: 0, upgrade_fleet: 1 }))]).toEqual([
      ['upgrade_fleet', 1],
    ]);
  });
});

describe('validateMeta', () => {
  it('accepts the shipped config', () => {
    expect(validateMeta()).toEqual([]);
  });

  it('every shipped upgrade caps and every id is prefixed to avoid a passive', () => {
    for (const upgrade of UPGRADES) {
      expect(upgrade.maxRank).toBeGreaterThanOrEqual(1);
      expect(upgrade.id.startsWith('upgrade_')).toBe(true);
    }
    for (const milestone of MILESTONES) expect(milestone.id.startsWith('milestone_')).toBe(true);
  });

  it('reports a bad field, a negative cost, an unknown milestone and a duplicate milestone', () => {
    const upgrades: Upgrade[] = [
      { ...vigor, id: 'upgrade_a', field: 'nope' as Upgrade['field'] },
      { ...vigor, id: 'upgrade_b', baseCost: -1 },
      { ...vigor, id: 'upgrade_c', requires: 'milestone_missing' as Upgrade['requires'] },
    ];
    const milestones: Milestone[] = [
      { id: 'm', name: 'M', description: '', stat: 'runs', atLeast: 1 },
      { id: 'm', name: 'M', description: '', stat: 'runs', atLeast: 0 },
    ];
    const problems = validateMeta(upgrades, milestones);
    expect(problems).toEqual([
      'upgrade "upgrade_a": no field "nope" on PlayerProfile',
      'duplicate milestone id "m"',
      'milestone "m": atLeast must be an integer >= 1, got 0',
      'upgrade "upgrade_b": costs must be >= 0',
      'upgrade "upgrade_c": requires unknown milestone "milestone_missing"',
    ]);
  });
});
