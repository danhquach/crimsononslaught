import { describe, expect, it } from 'vitest';
import {
  SAVE_COUNT_MAX,
  SAVE_FAILED_TEXT,
  SAVE_RESET_TEXT,
  SAVE_VERSION,
  emptySave,
  isSave,
  migrate,
  parseSave,
  recordRun,
  saveNotice,
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
  embers: 140,
  consumables: 3,
  relics: 2,
};

describe('emptySave', () => {
  it('is the current version with every counter at zero', () => {
    const save = emptySave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.profile).toEqual({
      name: '',
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

describe('version 1 saves (CO-165)', () => {
  // Written out by hand: `emptySave()` is version 2 now.
  const v1 = {
    version: 1,
    profile: {
      runs: 3,
      wins: 1,
      bestTimeMs: 125_000,
      bestLevel: 9,
      totalKills: 1500,
      spellCounts: { fire: 1, ice: 2 },
    },
    currency: 500,
    upgrades: { upgrade_vigor: 1 },
    settings: { volume: 0.5 },
  };

  it('lifts to version 2 with every counter, Ember, upgrade and setting kept and an empty name', () => {
    expect(SAVE_VERSION).toBe(2);
    expect(parseSave(JSON.stringify(v1))).toEqual({
      save: { ...v1, version: 2, profile: { ...v1.profile, name: '' } },
      status: 'ok',
    });
  });

  it('refuses a version 2 save with no name, and one whose name is not a string', () => {
    const { profile, ...rest } = v1;
    expect(parseSave(JSON.stringify({ ...rest, version: 2, profile })).status).toBe('reset');
    expect(
      parseSave(JSON.stringify({ ...rest, version: 2, profile: { ...profile, name: 7 } })).status,
    ).toBe('reset');
  });

  it('refuses a version 1 save whose profile is not an object', () => {
    expect(parseSave(JSON.stringify({ ...v1, profile: 'nope' }))).toEqual({
      save: emptySave(),
      status: 'reset',
      reason: 'wrong shape',
    });
  });

  it('still refuses a version newer than this build', () => {
    expect(parseSave(JSON.stringify({ ...v1, version: 3 })).status).toBe('reset');
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
      name: '',
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
      name: '',
      runs: 2,
      wins: 1,
      bestTimeMs: 300_000,
      bestLevel: 8,
      totalKills: 1244,
      spellCounts: { fire: 1, ice: 1 },
    });
    expect(two.currency).toBe(150);
  });

  it('keeps the player name (CO-165)', () => {
    const named = { ...emptySave(), profile: { ...emptySave().profile, name: 'Test_Player' } };
    expect(recordRun(named, stats, 'win', 10).profile.name).toBe('Test_Player');
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

describe('save counter ceiling (#316)', () => {
  const base = emptySave();
  /** One save per counter, each set to `value`. */
  const withEach = (value: unknown): [string, unknown][] => [
    ['currency', { ...base, currency: value }],
    ['runs', { ...base, profile: { ...base.profile, runs: value } }],
    ['wins', { ...base, profile: { ...base.profile, wins: value } }],
    ['totalKills', { ...base, profile: { ...base.profile, totalKills: value } }],
    ['bestLevel', { ...base, profile: { ...base.profile, bestLevel: value } }],
    ['spellCounts', { ...base, profile: { ...base.profile, spellCounts: { fire: value } } }],
    ['upgrades', { ...base, upgrades: { upgrade_vigor: value } }],
  ];

  it('is 1e9, under 2^31 and far past anything reachable', () => {
    expect(SAVE_COUNT_MAX).toBe(1e9);
  });

  it.each([1e308, 2 ** 53, SAVE_COUNT_MAX + 1, 1.5, -1, '5', null, true, [], {}])(
    'resets on a counter of %j, in every counter',
    (value) => {
      for (const [name, stored] of withEach(value)) {
        const parsed = parseSave(JSON.stringify(stored));
        expect(parsed.status, name).toBe('reset');
        expect(parsed.save, name).toEqual(emptySave());
      }
    },
  );

  it('resets on a best time past the ceiling, and on NaN or Infinity written as null', () => {
    for (const bestTimeMs of [1e10, SAVE_COUNT_MAX + 1, 1e308, null, -1]) {
      const stored = { ...base, profile: { ...base.profile, bestTimeMs } };
      expect(parseSave(JSON.stringify(stored)).status, String(bestTimeMs)).toBe('reset');
    }
    // 1e400 is an overflow to Infinity in JSON.parse, which is not a count either.
    const raw = serializeSave(base).replace('"currency":0', '"currency":1e400');
    expect(parseSave(raw).status).toBe('reset');
  });

  it('accepts a counter exactly at the ceiling', () => {
    for (const [name, stored] of withEach(SAVE_COUNT_MAX)) {
      const parsed = parseSave(JSON.stringify(stored));
      // A rank is capped by normalizeUpgrades, so only that field may differ.
      expect(parsed.status, name).toBe('ok');
    }
    const timed = { ...base, profile: { ...base.profile, bestTimeMs: SAVE_COUNT_MAX } };
    expect(parseSave(JSON.stringify(timed)).status).toBe('ok');
  });

  it('reads a stored -0 as 0, so no label draws "-0"', () => {
    const raw = serializeSave(base)
      .replace('"currency":0', '"currency":-0')
      .replace('"runs":0', '"runs":-0')
      .replace('"settings":{}', '"settings":{"volume":-0}');
    expect(raw).toContain('-0');
    const { save, status } = parseSave(raw);
    expect(status).toBe('ok');
    expect(Object.is(save.currency, 0)).toBe(true);
    expect(Object.is(save.profile.runs, 0)).toBe(true);
    expect(Object.is(save.settings.volume, 0)).toBe(true);
  });

  it('never lets a __proto__ key reach Object.prototype', () => {
    const polluted = '{"__proto__":{"polluted":1}}';
    const at = (where: string) =>
      serializeSave(base).replace(where, `${where.slice(0, -1)}"__proto__":{"polluted":1}}`);
    const cases = [
      polluted,
      `{"__proto__":{"polluted":1},"version":${SAVE_VERSION}}`,
      at('"spellCounts":{}'),
      at('"upgrades":{}'),
      at('"settings":{}'),
      serializeSave(base).replace(
        '"name":""',
        '"name":"","__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}',
      ),
      '{"constructor":{"prototype":{"polluted":1}},"prototype":1}',
    ];
    for (const json of cases) {
      // Each case must be real JSON, or the test would only prove "not valid JSON" resets.
      expect(() => JSON.parse(json) as unknown, json).not.toThrow();
      expect(() => parseSave(json), json).not.toThrow();
      const parsed = parseSave(json);
      expect(['ok', 'reset']).toContain(parsed.status);
      expect(isSave(parsed.save)).toBe(true);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getPrototypeOf(parsed.save)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(parsed.save.upgrades)).toBe(Object.prototype);
    }
  });

  it('resets on a 1 MB junk string and on oversized or look-alike names without throwing', () => {
    expect(parseSave('x'.repeat(1_000_000)).status).toBe('reset');
    expect(parseSave(`"${'a'.repeat(1_000_000)}"`).status).toBe('reset');
    const named = (name: string) => ({ ...base, profile: { ...base.profile, name } });
    for (const name of ['\u202eevil', 'a\u200bb', 'ﬁre', 'a'.repeat(100_000)]) {
      expect(() => parseSave(JSON.stringify(named(name)))).not.toThrow();
    }
  });
});

describe('recordRun ceiling (#316)', () => {
  it('saturates the balance, and the result is still a valid save', () => {
    const near = { ...emptySave(), currency: SAVE_COUNT_MAX - 5 };
    const after = recordRun(near, stats, 'win', 100);
    expect(after.currency).toBe(SAVE_COUNT_MAX);
    expect(isSave(after)).toBe(true);
  });

  it('saturates every counter at the ceiling and survives a parse round trip', () => {
    const full: Save = {
      ...emptySave(),
      currency: SAVE_COUNT_MAX,
      profile: {
        name: '',
        runs: SAVE_COUNT_MAX,
        wins: SAVE_COUNT_MAX,
        bestTimeMs: SAVE_COUNT_MAX,
        bestLevel: SAVE_COUNT_MAX,
        totalKills: SAVE_COUNT_MAX - 3,
        spellCounts: { fire: SAVE_COUNT_MAX },
      },
    };
    const after = recordRun(full, { ...stats, timeSurvivedMs: 1e12, level: 5e9 }, 'win', 1e12);
    expect(after.profile).toEqual({
      name: '',
      runs: SAVE_COUNT_MAX,
      wins: SAVE_COUNT_MAX,
      bestTimeMs: SAVE_COUNT_MAX,
      bestLevel: SAVE_COUNT_MAX,
      totalKills: SAVE_COUNT_MAX,
      spellCounts: { fire: SAVE_COUNT_MAX },
    });
    expect(after.currency).toBe(SAVE_COUNT_MAX);
    expect(isSave(after)).toBe(true);
    expect(parseSave(serializeSave(after)).status).toBe('ok');
  });
});

describe('saveNotice (#316)', () => {
  it('says nothing when the save is fine', () => {
    expect(saveNotice(false, false)).toBeNull();
  });

  it('announces a reset on its own', () => {
    expect(saveNotice(true, false)).toBe(SAVE_RESET_TEXT);
    expect(SAVE_RESET_TEXT).toBe('Saved progress could not be read and was reset.');
  });

  it('announces a failed write, and that wins over a reset', () => {
    expect(saveNotice(false, true)).toBe(SAVE_FAILED_TEXT);
    expect(saveNotice(true, true)).toBe(SAVE_FAILED_TEXT);
    expect(SAVE_FAILED_TEXT).toBe('Progress could not be saved in this browser.');
  });
});

describe('parseSave minimap settings (CO-207)', () => {
  const withSettings = (settings: string): string =>
    `{"version":${SAVE_VERSION},"profile":${JSON.stringify(emptySave().profile)},"currency":0,"upgrades":{},"settings":${settings}}`;

  it('keeps the allowed booleans and drops every other minimap key', () => {
    const parsed = parseSave(
      withSettings(
        '{"minimap.on":false,"minimap.evil":true,"minimap.boss":"yes","minimap.pickups\u200b":true,"audio.master":0.4}',
      ),
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.save.settings).toEqual({ 'minimap.on': false, 'audio.master': 0.4 });
  });

  it('keeps the pickup kind switches and drops hostile look-alikes (#383)', () => {
    const parsed = parseSave(
      withSettings(
        '{"minimap.pickups.gem":true,"minimap.pickups.relic":"no","minimap.pickups.health.x":true,"minimap.pickups.constructor":true,"minimap.pickups.g\u200bem":true}',
      ),
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.save.settings).toEqual({ 'minimap.pickups.gem': true });
  });

  it('resets a save whose settings carry a __proto__ object, leaving Object.prototype alone', () => {
    const parsed = parseSave(withSettings('{"__proto__":{"minimap.on":false}}'));
    expect(parsed.status).toBe('reset');
    expect(({} as Record<string, unknown>)['minimap.on']).toBeUndefined();
    expect(parsed.save.settings).toEqual({});
  });

  it('resets a save with a null switch, like any non-primitive setting', () => {
    expect(parseSave(withSettings('{"minimap.on":null}')).status).toBe('reset');
  });

  it('resets on broken JSON', () => {
    expect(parseSave('{"settings":{"minimap.on":').status).toBe('reset');
  });
});
