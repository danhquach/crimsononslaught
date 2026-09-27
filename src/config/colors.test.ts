import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS, TEXTURE_KEYS } from './colors';

// The spec (section 6) fixes the set of texture keys every entity may request.
const SPEC_KEYS = [
  'player',
  'enemy_swarm',
  'enemy_fast',
  'enemy_tank',
  // #126: the ranged enemy and its shot.
  'enemy_ranged',
  'proj_enemy',
  // #126: the exploder, the splitter and its child.
  'enemy_exploder',
  'enemy_splitter',
  'enemy_splitling',
  'boss',
  'gem',
  'proj_fire',
  'fx_nova',
  'fx_bolt',
  // #202: Lightning Bolt's own shot, apart from Chain Lightning's strip.
  'proj_bolt',
  'boulder',
  // Phase 2 §10: every new spell registers a texture key and a placeholder
  // colour on day one; the companions' own sheets land with #146.
  'companion',
  'proj_ice',
  // #205: Earth Spike's shot, apart from Boulder's disc.
  'proj_spike',
  'shield_ice',
  'fx_area',
  'fx_telegraph',
  // #195: Embers and relics on the floor.
  'pickup_ember',
  'pickup_relic',
  // #128: a consumable per kind.
  'pickup_health',
  'pickup_magnet',
  'pickup_bomb',
  'pickup_chest',
];

/** Hue of a 24-bit colour in degrees, 0–360. */
function hue(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('enemy shot vs player shots (#126)', () => {
  /** Everything the player's side fires or swings: what an enemy shot must never look like. */
  const PLAYER_SHOTS = [
    'proj_fire',
    'proj_ice',
    'proj_bolt',
    'proj_spike',
    'fx_bolt',
    'boulder',
  ] as const;

  it('sits at least 60° of hue away from every player shot', () => {
    const enemy = hue(PLACEHOLDERS.proj_enemy.color);
    for (const key of PLAYER_SHOTS) {
      const gap = Math.abs(enemy - hue(PLACEHOLDERS[key].color));
      expect(Math.min(gap, 360 - gap), key).toBeGreaterThanOrEqual(60);
    }
  });

  it('has a shape no player shot has', () => {
    const shapes = PLAYER_SHOTS.map((key) => PLACEHOLDERS[key].shape);
    expect(shapes).not.toContain(PLACEHOLDERS.proj_enemy.shape);
  });
});

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
