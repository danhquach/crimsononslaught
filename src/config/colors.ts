/**
 * Placeholder look for every texture key (spec section 6).
 *
 * Pure data, no Phaser import, so it is unit-tested. `render/textures.ts`
 * turns each entry into a generated texture at boot; entities only ever ask
 * for a `TextureKey`, so swapping in real art touches nothing here but the
 * generator (see README "Swapping in a sprite atlas").
 */

export const TEXTURE_KEYS = [
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
] as const;

export type TextureKey = (typeof TEXTURE_KEYS)[number];

interface PlaceholderBase {
  /** 24-bit RGB, e.g. 0xff5252. */
  color: number;
  /** Generated texture size in pixels; the shape is centered and fills it. */
  width: number;
  height: number;
}

export type Placeholder = PlaceholderBase &
  ({ shape: 'circle' | 'rect' | 'triangle' | 'diamond' } | { shape: 'ring'; thickness: number });

export const PLACEHOLDERS: Readonly<Record<TextureKey, Placeholder>> = {
  player: { shape: 'circle', color: 0xf5f5f5, width: 28, height: 28 },
  enemy_swarm: { shape: 'circle', color: 0xff5252, width: 16, height: 16 },
  enemy_fast: { shape: 'triangle', color: 0xffb300, width: 20, height: 20 },
  enemy_tank: { shape: 'rect', color: 0x8e1b1b, width: 32, height: 32 },
  boss: { shape: 'ring', color: 0x9c27b0, width: 80, height: 80, thickness: 10 },
  gem: { shape: 'diamond', color: 0x69f0ae, width: 12, height: 16 },
  proj_fire: { shape: 'circle', color: 0xff6d00, width: 12, height: 12 },
  fx_nova: { shape: 'ring', color: 0x40c4ff, width: 96, height: 96, thickness: 4 },
  fx_bolt: { shape: 'rect', color: 0xffee58, width: 48, height: 4 },
  boulder: { shape: 'circle', color: 0x8d6e63, width: 20, height: 20 },
};
