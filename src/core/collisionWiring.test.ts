import { describe, expect, it } from 'vitest';

/**
 * CO-032's acceptance criterion as a test: overlap and collider registration
 * lives in `systems/CollisionSystem.ts` and nowhere else, so there is one place
 * to look for what can hit what. Spells register their hitboxes through
 * `addSpellGroup` rather than reaching for the physics world themselves.
 *
 * A source scan rather than a runtime check: Phaser scenes are exercised by the
 * Playwright smoke suite (CO-060), and this invariant is about where code is
 * written, not what it does at run time. Vite's glob reads the tree, so the test
 * needs no filesystem access of its own.
 */
const OWNER = '../systems/CollisionSystem.ts';
const REGISTRATION = /\bphysics\.add\.(overlap|collider)\b/;

const sources = import.meta.glob('../**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const production = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'));

describe('collision wiring (CO-032)', () => {
  it('scans the whole source tree', () => {
    expect(production.map(([path]) => path)).toContain(OWNER);
    expect(production.length).toBeGreaterThan(10);
  });

  it('registers overlaps only in CollisionSystem', () => {
    const offenders = production
      .filter(([path, source]) => path !== OWNER && REGISTRATION.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('still registers them there', () => {
    expect(sources[OWNER]).toMatch(REGISTRATION);
  });

  it('registers every run-wide pair there, the floor pickups included (#195)', () => {
    const owner = sources[OWNER] ?? '';
    for (const target of ['enemies.group', 'gems.group', 'pickups.group']) {
      expect(owner, target).toMatch(
        new RegExp(`physics\\.add\\.overlap\\(player, ${target.replace('.', '\\.')}`),
      );
    }
  });
});
