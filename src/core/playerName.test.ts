import { describe, expect, it } from 'vitest';
import {
  PLAYER_NAME_MAX,
  ensurePlayerName,
  generatePlayerName,
  validatePlayerName,
} from './playerName';
import { createRng } from './rng';
import { emptySave, type Save } from './save';

const fixed = (n: number) => ({ int: () => n });

function named(name: string): Save {
  const save = emptySave();
  return { ...save, profile: { ...save.profile, name } };
}

describe('generatePlayerName', () => {
  it('is Player and 9 digits, leading zeros kept', () => {
    expect(generatePlayerName(fixed(0))).toBe('Player000000000');
    expect(generatePlayerName(fixed(48_213_775))).toBe('Player048213775');
    expect(generatePlayerName(fixed(999_999_999))).toBe('Player999999999');
  });

  it('always gives a valid name, from any seed', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const name = generatePlayerName(createRng(seed * 7919));
      expect(name).toMatch(/^Player\d{9}$/);
      expect(validatePlayerName(name)).toEqual({ ok: true, name });
    }
  });
});

describe('validatePlayerName', () => {
  it('trims, then accepts 1 to 16 characters', () => {
    expect(validatePlayerName('  New_Name 1  ')).toEqual({ ok: true, name: 'New_Name 1' });
    expect(validatePlayerName('a')).toEqual({ ok: true, name: 'a' });
    const longest = 'x'.repeat(PLAYER_NAME_MAX);
    expect(validatePlayerName(longest)).toEqual({ ok: true, name: longest });
  });

  it('refuses an empty or whitespace-only name', () => {
    for (const raw of ['', '   ', '\t'])
      expect(validatePlayerName(raw)).toEqual({ ok: false, reason: "Name can't be empty." });
  });

  it('refuses 17 characters, counted after trimming', () => {
    expect(validatePlayerName('x'.repeat(PLAYER_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: '16 characters at most.',
    });
    expect(validatePlayerName(` ${'x'.repeat(PLAYER_NAME_MAX)} `).ok).toBe(true);
  });

  it('refuses anything but letters, numbers, spaces and underscores', () => {
    for (const raw of ['bad-name!', 'Zoë', 'ab😀', 'a\tb', 'a\nb', 'a​b', 'a.b']) {
      expect(validatePlayerName(raw), JSON.stringify(raw)).toEqual({
        ok: false,
        reason: 'Letters, numbers, spaces and underscores only.',
      });
    }
    expect(validatePlayerName('Under_score and space').ok).toBe(false); // 21 characters
    expect(validatePlayerName('Under_ Score 9').ok).toBe(true);
  });
});

/** Markup, script, SQL and template payloads: none may pass as a name. */
const HOSTILE = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' OR 1=1 --",
  'Robert"); DROP TABLE',
  '${7*7}',
  '{{7*7}}',
  'javascript:alert(1)',
  '&lt;b&gt;',
  'a\u0000b',
  '\u202eevil',
];

describe('hostile names (CO-165)', () => {
  it('refuses every markup, script, SQL and template payload', () => {
    for (const raw of HOSTILE) expect(validatePlayerName(raw).ok, JSON.stringify(raw)).toBe(false);
  });

  it('replaces a hostile name hand-edited into storage with a generated one', () => {
    for (const raw of HOSTILE)
      expect(ensurePlayerName(named(raw), fixed(5)).profile.name).toBe('Player000000005');
  });

  it('refuses a pasted megabyte on length, before the pattern ever sees it', () => {
    expect(validatePlayerName('<'.repeat(1_000_000))).toEqual({
      ok: false,
      reason: '16 characters at most.',
    });
  });
});

describe('ensurePlayerName', () => {
  it('returns the same save when the name is already valid', () => {
    const save = named('Test_Player');
    expect(ensurePlayerName(save, fixed(1))).toBe(save);
  });

  it('gives an empty or invalid name a generated one, leaving the rest alone', () => {
    for (const name of ['', 'bad-name!', 'x'.repeat(40)]) {
      const save = { ...named(name), currency: 42 };
      const out = ensurePlayerName(save, fixed(7));
      expect(out).toEqual({ ...save, profile: { ...save.profile, name: 'Player000000007' } });
      expect(save.profile.name).toBe(name);
    }
  });

  it('trims a name that is only valid once trimmed, rather than replacing it', () => {
    expect(ensurePlayerName(named('  Test_Player '), fixed(7)).profile.name).toBe('Test_Player');
  });
});
