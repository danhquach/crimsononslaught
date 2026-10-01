import {
  DEFAULT_MINIMAP_SETTINGS,
  MINIMAP_KEY_PREFIX,
  MINIMAP_MAX_PICKUPS,
  MINIMAP_PADDING,
  MINIMAP_RANGE,
  MINIMAP_SETTING_KEYS,
  type MinimapPickupKind,
  type MinimapSettings,
} from '../config/minimap';
import type { Vec2 } from './input';
import { inView, type ViewRect } from './pickups';
import type { SaveSettings } from './save';

/** The event Game emits on its own emitter, every `MINIMAP_REFRESH_MS`, for the HUD's minimap. */
export const MINIMAP_EVENT = 'minimap:frame';

export interface MinimapPickup extends Vec2 {
  kind: MinimapPickupKind;
}

/** One snapshot of the run, in world px. Layers a switch turns off arrive empty. */
export interface MinimapFrame {
  settings: MinimapSettings;
  arena: { readonly width: number; readonly height: number };
  player: Vec2;
  view: ViewRect;
  boss: Vec2 | null;
  /** Every floor pickup of a marked kind; `buildMinimapView` keeps those off screen. */
  pickups: MinimapPickup[];
  /** Enemy positions as x, y, x, y, ... */
  enemies: number[];
}

/** A line in px from the minimap box's top-left corner. */
export interface MapSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A marker on the map; `pinned` when it lies beyond the rim and is held on it. */
export interface MapMarker extends Vec2 {
  pinned: boolean;
}

/** What the HUD draws, in px from the minimap box's top-left corner. */
export interface MinimapView {
  /** The parts of the arena's edge inside the circle; empty while the edge is out of range. */
  arena: MapSegment[];
  /** Always the circle's centre. */
  player: Vec2;
  /** The parts of the camera's view outline inside the circle. */
  viewport: MapSegment[] | null;
  boss: MapMarker | null;
  pickups: (MapMarker & { kind: MinimapPickupKind })[];
  /** Dot positions inside the circle as x, y, x, y, ... */
  enemies: number[];
}

/** The minimap switches held in a save's `settings`; own keys only, anything but a boolean is the default. */
export function readMinimapSettings(saved: Readonly<SaveSettings>): MinimapSettings {
  const out = {} as MinimapSettings;
  for (const name of Object.keys(MINIMAP_SETTING_KEYS) as (keyof MinimapSettings)[]) {
    const key = MINIMAP_SETTING_KEYS[name];
    const value = Object.hasOwn(saved, key) ? saved[key] : undefined;
    out[name] = typeof value === 'boolean' ? value : DEFAULT_MINIMAP_SETTINGS[name];
  }
  return out;
}

/** A save's `settings` with the minimap switches written over it; other keys kept. */
export function writeMinimapSettings(
  saved: Readonly<SaveSettings>,
  minimap: Readonly<MinimapSettings>,
): SaveSettings {
  const written: SaveSettings = { ...saved };
  for (const name of Object.keys(MINIMAP_SETTING_KEYS) as (keyof MinimapSettings)[]) {
    written[MINIMAP_SETTING_KEYS[name]] = minimap[name] === true;
  }
  return written;
}

/**
 * A save's `settings` without any `minimap.` key that is not one of the
 * switches or whose value is not a boolean. The load-time allow-list (CO-207):
 * a stored file never grows the save with keys it invented.
 */
export function dropUnknownMinimapKeys(saved: Readonly<SaveSettings>): SaveSettings {
  const allowed: readonly string[] = Object.values(MINIMAP_SETTING_KEYS);
  const kept: SaveSettings = {};
  for (const [key, value] of Object.entries(saved)) {
    if (
      key.startsWith(MINIMAP_KEY_PREFIX) &&
      !(allowed.includes(key) && typeof value === 'boolean')
    )
      continue;
    kept[key] = value;
  }
  return kept;
}

/**
 * The part of the segment a to b inside the circle of radius `r` at the origin,
 * or null when none of it is (a tangent touch is none).
 */
export function clipSegment(a: Vec2, b: Vec2, r: number): { a: Vec2; b: Vec2 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const half = -(a.x * dx + a.y * dy) / len2;
  const disc = half * half - (a.x * a.x + a.y * a.y - r * r) / len2;
  if (!(disc > 0)) return null;
  const root = Math.sqrt(disc);
  const t1 = Math.max(0, half - root);
  const t2 = Math.min(1, half + root);
  if (!(t1 < t2)) return null;
  return {
    a: { x: a.x + dx * t1, y: a.y + dy * t1 },
    b: { x: a.x + dx * t2, y: a.y + dy * t2 },
  };
}

/**
 * The frame as the circle draws it, the player at its centre. World offsets
 * from the player scale by `usable radius / MINIMAP_RANGE`. Rectangle edges are
 * clipped to the circle; the boss and off-screen pickups beyond the rim are
 * pinned to it, enemies beyond it dropped; layers a switch turns off come out empty.
 */
export function buildMinimapView(frame: Readonly<MinimapFrame>, box: number): MinimapView {
  const { settings, arena, player } = frame;
  const centre = box / 2;
  const radius = centre - MINIMAP_PADDING;
  const scale = radius / MINIMAP_RANGE;
  const rel = (p: Vec2): Vec2 => ({ x: (p.x - player.x) * scale, y: (p.y - player.y) * scale });
  const toBox = (p: Vec2): Vec2 => ({ x: centre + p.x, y: centre + p.y });
  const marker = (p: Vec2): MapMarker => {
    const r = rel(p);
    const dist = Math.hypot(r.x, r.y);
    if (dist <= radius) return { ...toBox(r), pinned: false };
    return { ...toBox({ x: (r.x / dist) * radius, y: (r.y / dist) * radius }), pinned: true };
  };
  const outline = (x: number, y: number, width: number, height: number): MapSegment[] => {
    const corners = [
      rel({ x, y }),
      rel({ x: x + width, y }),
      rel({ x: x + width, y: y + height }),
      rel({ x, y: y + height }),
    ];
    const segments: MapSegment[] = [];
    corners.forEach((from, i) => {
      const clipped = clipSegment(from, corners[(i + 1) % 4] ?? from, radius);
      if (!clipped) return;
      const p = toBox(clipped.a);
      const q = toBox(clipped.b);
      segments.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    });
    return segments;
  };

  /**
   * The off-screen pickups whose kind is switched on, at most `MINIMAP_MAX_PICKUPS`:
   * the nearest first, but gems last (#383), so hundreds of them never push a relic off the map.
   */
  const nearestPickups = (f: Readonly<MinimapFrame>): MinimapView['pickups'] =>
    f.pickups
      .filter((p) => settings[p.kind] && !inView(f.view, p))
      .map((p) => ({ dist: Math.hypot(p.x - player.x, p.y - player.y), p }))
      .sort((a, b) => Number(a.p.kind === 'gem') - Number(b.p.kind === 'gem') || a.dist - b.dist)
      .slice(0, MINIMAP_MAX_PICKUPS)
      .map(({ p }) => ({ ...marker(p), kind: p.kind }));

  const enemies: number[] = [];
  if (settings.enemies) {
    for (let i = 0; i + 1 < frame.enemies.length; i += 2) {
      const r = rel({ x: frame.enemies[i] ?? 0, y: frame.enemies[i + 1] ?? 0 });
      if (Math.hypot(r.x, r.y) <= radius) enemies.push(centre + r.x, centre + r.y);
    }
  }
  return {
    arena: outline(0, 0, arena.width, arena.height),
    player: { x: centre, y: centre },
    viewport: settings.viewport
      ? outline(frame.view.x, frame.view.y, frame.view.width, frame.view.height)
      : null,
    boss: settings.boss && frame.boss ? marker(frame.boss) : null,
    pickups: settings.pickups ? nearestPickups(frame) : [],
    enemies,
  };
}
