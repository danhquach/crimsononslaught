import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS, TEXTURE_KEYS } from './colors';

// The spec (section 6) fixes the set of texture keys every entity may request.
const SPEC_KEYS = [
  'player',
  'enemy_swarm',
  'enemy_fast',
  'enemy_tank',
  'boss',
  'gem',
  'proj_fire',
  'fx_nova',
  'fx_bolt',
  'boulder',
  // Phase 2 §10: every new spell registers a texture key and a placeholder
  // colour on day one; the companions' own sheets land with #146.
  'companion',
  'proj_ice',
  'shield_ice',
  'fx_area',
  'fx_telegraph',
];

describe('placeholder texture config', () => {
  it('defines exactly the texture keys from the spec', () => {
    expect([...TEXTURE_KEYS].sort()).toEqual([...SPEC_KEYS].sort());
    expect(Object.keys(PLACEHOLDERS).sort()).toEqual([...SPEC_KEYS].sort());
  });

  it('gives every key a distinct color', () => {
    const colors = TEXTURE_KEYS.map((k) => PLACEHOLDERS[k].color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('gives every key a distinct shape+size silhouette', () => {
    const silhouettes = TEXTURE_KEYS.map((k) => {
      const p = PLACEHOLDERS[k];
      const ring = p.shape === 'ring' ? `:${p.thickness}` : '';
      return `${p.shape}:${p.width}x${p.height}${ring}`;
    });
    expect(new Set(silhouettes).size).toBe(silhouettes.length);
  });

  it('uses valid 24-bit colors and positive integer sizes', () => {
    for (const key of TEXTURE_KEYS) {
      const p = PLACEHOLDERS[key];
      expect(p.color, key).toBeGreaterThanOrEqual(0);
      expect(p.color, key).toBeLessThanOrEqual(0xffffff);
      expect(Number.isInteger(p.width) && p.width > 0, key).toBe(true);
      expect(Number.isInteger(p.height) && p.height > 0, key).toBe(true);
      if (p.shape === 'ring') {
        expect(p.thickness, key).toBeGreaterThan(0);
        expect(p.thickness * 2, key).toBeLessThan(Math.min(p.width, p.height));
      }
    }
  });
});
