import { PLACEHOLDERS } from './colors';
import type { FrameName } from './frames';

/**
 * The minimap (CO-207): its switches, where it sits on the HUD and how it is
 * drawn. Pure data, no Phaser import; `core/minimap.ts` turns a frame of the
 * run into what is drawn.
 */

/** The save's `settings` keys, flat booleans like every other switch. */
export const MINIMAP_SETTING_KEYS = {
  on: 'minimap.on',
  viewport: 'minimap.viewport',
  boss: 'minimap.boss',
  pickups: 'minimap.pickups',
  enemies: 'minimap.enemies',
  health: 'minimap.pickups.health',
  magnet: 'minimap.pickups.magnet',
  bomb: 'minimap.pickups.bomb',
  chest: 'minimap.pickups.chest',
  relic: 'minimap.pickups.relic',
  ember: 'minimap.pickups.ember',
  gem: 'minimap.pickups.gem',
} as const;

/** Every save key this feature owns starts with this; anything else under it is dropped on load. */
export const MINIMAP_KEY_PREFIX = 'minimap.';

export interface MinimapSettings {
  on: boolean;
  viewport: boolean;
  boss: boolean;
  pickups: boolean;
  enemies: boolean;
  /** One switch per pickup kind (#383); `pickups` above hides them all. */
  health: boolean;
  magnet: boolean;
  bomb: boolean;
  chest: boolean;
  relic: boolean;
  ember: boolean;
  gem: boolean;
}

/** Enemies and XP gems start off: a full crowd and hundreds of gems are the costliest layers to draw. */
export const DEFAULT_MINIMAP_SETTINGS: Readonly<MinimapSettings> = {
  on: true,
  viewport: true,
  boss: true,
  pickups: true,
  enemies: false,
  health: true,
  magnet: true,
  bomb: true,
  chest: true,
  relic: true,
  ember: true,
  gem: false,
};

/** Run-clock ms between the snapshots Game hands the HUD. */
export const MINIMAP_REFRESH_MS = 100;

/**
 * The round map's bounding box on the 960 x 540 HUD: bottom-right, a 16 px
 * margin from both edges. The spell slots stop near x 450 and the top-right
 * corner holds to y 270, so nothing else is drawn here.
 */
export const MINIMAP_BOX = { x: 824, y: 404, size: 120 } as const;

/**
 * Gap between the rim and the furthest marker centre, px; the usable radius is
 * half the box minus this. Wide enough that a rim-pinned boss icon stays inside the ring.
 */
export const MINIMAP_PADDING = 9;

/** World px from the player (the circle's centre) to the usable rim; the 960 x 540 view box fits well inside. */
export const MINIMAP_RANGE = 1000;

/** Enemy dots are this many px square. */
export const MINIMAP_ENEMY_DOT = 2;

/** Marker icon sizes on the map, px, the longer side of the scaled atlas frame. */
export const MINIMAP_ICON_SIZE = 11;
export const MINIMAP_BOSS_ICON_SIZE = 14;

/** Icons drawn for floor pickups at once; rare kinds are drawn first and XP gems only fill what is left, nearest first within each. */
export const MINIMAP_MAX_PICKUPS = 24;

/** The atlas frame each marker shows; without the atlas the flat shapes in `MINIMAP_COLORS` stand in. */
export const MINIMAP_ICON_FRAMES = {
  health: 'pickupHealth.idle.0',
  magnet: 'pickupMagnet.idle.0',
  bomb: 'pickupBomb.idle.0',
  chest: 'pickupChest.idle.0',
  relic: 'pickupRelic.idle.0',
  ember: 'pickupEmber.idle.0',
  gem: 'gem.idle.0',
  boss: 'boss.walk.down.0',
} as const satisfies Record<string, FrameName>;

export const MINIMAP_COLORS = {
  plate: 0x000000,
  plateAlpha: 0.6,
  ring: 0xe8e2d8,
  outline: 0xcfc6bb,
  viewport: 0xffffff,
  player: 0xffffff,
  boss: PLACEHOLDERS.boss.color,
  enemy: 0xb23a3a,
  health: PLACEHOLDERS.pickup_health.color,
  magnet: PLACEHOLDERS.pickup_magnet.color,
  bomb: PLACEHOLDERS.pickup_bomb.color,
  chest: PLACEHOLDERS.pickup_chest.color,
  relic: PLACEHOLDERS.pickup_relic.color,
  ember: PLACEHOLDERS.pickup_ember.color,
  gem: PLACEHOLDERS.gem.color,
} as const;

/** Floor pickups the map marks when they lie off screen. */
export const MINIMAP_PICKUP_KINDS = [
  'health',
  'magnet',
  'bomb',
  'chest',
  'relic',
  'ember',
  'gem',
] as const;

export type MinimapPickupKind = (typeof MINIMAP_PICKUP_KINDS)[number];
