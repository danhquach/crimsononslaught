import { describe, expect, it } from 'vitest';
import {
  SAVE_VERSION,
  emptySave,
  isSave,
  migrate,
  parseSave,
  recordRun,
  serializeSave,
  type MigrationStep,
  type Save,
} from './save';
import type { RunStats } from './scenePayloads';

const stats: RunStats = {
  timeSurvivedMs: 272_400,
  level: 8,
  kills: 1234,
  spellId: 'fire',
  perks: ['Power'],
  embers: 140,
  consumables: 3,
  relics: 2,
};

describe('emptySave', () => {
  it('is the current version with every counter at zero', () => {
    const save = emptySave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.profile).toEqual({
      runs: 0,
      wins: 0,
      bestTimeMs: 0,
      bestLevel: 0,
      totalKills: 0,
      spellCounts: {},
    });
    expect(save.currency).toBe(0);
    expect(save.upgrades).toEqual({});
    expect(save.settings).toEqual({});
  });

  it('is a fresh object every call', () => {
    expect(emptySave()).not.toBe(emptySave());
    expect(isSave(emptySave())).toBe(true);
  });
});

describe('parseSave', () => {
  it('reads nothing stored as an empty save', () => {
    expect(parseSave(null)).toEqual({ save: emptySave(), status: 'empty' });
    expect(parseSave('')).toEqual({ save: emptySave(), status: 'empty' });
  });

  it('round-trips through serializeSave', () => {
    const save = recordRun(emptySave(), stats, 'win', 500);
    save.upgrades.upgrade_vigor = 2;
    save.settings.volume = 0.5;
    expect(parseSave(serializeSave(save))).toEqual({ save, status: 'ok' });
  });

  it.each([
    ['not JSON at all', '{oops', 'not valid JSON'],
    ['an array', '[1,2]', 'not an object'],
    ['a string', '"hello"', 'not an object'],
    ['no version', '{"profile":{}}', 'no version'],
    [
      'a newer version',
      `{"version":${SAVE_VERSION + 1}}`,
      `version ${SAVE_VERSION + 1} is newer than ${SAVE_VERSION}`,
    ],
    [
      'a truncated profile',
      `{"version":${SAVE_VERSION},"profile":{"runs":1},"currency":0,"upgrades":{},"settings":{}}`,
      'wrong shape',
    ],
    ['negative currency', JSON.stringify({ ...emptySave(), currency: -5 }), 'wrong shape'],
    [
      'a fractional rank',
      JSON.stringify({ ...emptySave(), upgrades: { upgrade_vigor: 1.5 } }),
      'wrong shape',
    ],
    [
      'an object in settings',
      JSON.stringify({ ...emptySave(), settings: { nested: {} } }),
      'wrong shape',
    ],
  ])('resets on %s and says why', (_name, json, reason) => {
    expect(parseSave(json)).toEqual({ save: emptySave(), status: 'reset', reason });
  });

  it('never throws on hostile input', () => {
    for (const json of ['null', 'undefined', '{}', '{"version":"1"}', '{"version":1e400}', '\0']) {
      expect(() => parseSave(json)).not.toThrow();
      expect(parseSave(json).status).toBe('reset');
    }
  });

  it('drops upgrades this build does not have and caps ranks at maxRank', () => {
    const stored = {
      ...emptySave(),
      upgrades: { upgrade_vigor: 99, upgrade_gone: 3, upgrade_fleet: 0 },
    };
    const { save, status } = parseSave(JSON.stringify(stored));
    expect(status).toBe('ok');
    expect(save.upgrades).toEqual({ upgrade_vigor: 5 });
  });
});

describe('migrate', () => {
  const lift1to2: MigrationStep = (old) => ({
    ...old,
    settings: { ...(old.settings as object), migrated: true },
  });

  it('walks an older save forward one step at a time', () => {
    const v1 = { ...emptySave(), version: 1 };
    const result = migrate(v1, { 1: lift1to2 }, 2);
    expect(result).toEqual({
      ok: true,
      save: { ...emptySave(), version: 2, settings: { migrated: true } },
    });
  });

  it('chains several steps and stamps the version after each', () => {
    const seen: number[] = [];
    const note: MigrationStep = (old) => {
      seen.push(old.version as number);
      return old;
    };
    const result = migrate({ ...emptySave(), version: 1 }, { 1: note, 2: note }, 3);
    expect(result.ok).toBe(true);
    expect(seen).toEqual([1, 2]);
    if (result.ok) expect(result.save.version).toBe(3);
  });

  it('refuses a version with no step to lift it', () => {
    expect(migrate({ ...emptySave(), version: 1 }, {}, 3)).toEqual({
      ok: false,
      reason: 'no migration from version 1',
    });
  });

  it('refuses a migration whose output is not a save', () => {
    const breakIt: MigrationStep = () => ({ nonsense: true });
    expect(migrate({ ...emptySave(), version: 1 }, { 1: breakIt }, 2)).toEqual({
      ok: false,
      reason: 'wrong shape',
    });
  });

  it('accepts the current version with no steps at all', () => {
    expect(migrate(emptySave())).toEqual({ ok: true, save: emptySave() });
  });
});

describe('recordRun', () => {
  it('banks exactly the Embers the run collected, win, lose or ended (#195, #252)', () => {
    for (const outcome of ['win', 'lose', 'ended'] as const) {
      const before = { ...emptySave(), currency: 25 };
      const after = recordRun(before, stats, outcome, stats.embers);
      expect(after.currency - before.currency, outcome).toBe(stats.embers);
    }
  });

  it('folds a run into the counters, bests and spell tally', () => {
    const one = recordRun(emptySave(), stats, 'lose', 100);
    expect(one.profile).toEqual({
      runs: 1,
      wins: 0,
      bestTimeMs: 272_400,
      bestLevel: 8,
      totalKills: 1234,
      spellCounts: { fire: 1 },
    });
    expect(one.currency).toBe(100);

    const two = recordRun(
      one,
      { ...stats, timeSurvivedMs: 300_000, level: 6, kills: 10, spellId: 'ice' },
      'win',
      50,
    );
    expect(two.profile).toEqual({
      runs: 2,
      wins: 1,
      bestTimeMs: 300_000,
      bestLevel: 8,
      totalKills: 1244,
      spellCounts: { fire: 1, ice: 1 },
    });
    expect(two.currency).toBe(150);
  });

  it('counts an ended run (#252) as a run played, not a win', () => {
    const ended = recordRun(emptySave(), stats, 'ended', 100);
    expect(ended.profile.runs).toBe(1);
    expect(ended.profile.wins).toBe(0);
    expect(ended.profile.totalKills).toBe(stats.kills);
  });

  it('leaves the save it was given alone', () => {
    const before = emptySave();
    const snapshot = structuredClone(before);
    recordRun(before, stats, 'win', 10);
    expect(before).toEqual(snapshot);
  });

  it('keeps upgrades and settings, and floors the payout', () => {
    const save: Save = { ...emptySave(), upgrades: { upgrade_vigor: 1 }, settings: { volume: 1 } };
    const next = recordRun(save, stats, 'win', 12.9);
    expect(next.upgrades).toEqual({ upgrade_vigor: 1 });
    expect(next.settings).toEqual({ volume: 1 });
    expect(next.currency).toBe(12);
    expect(isSave(next)).toBe(true);
  });
});
