import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINIMAP_SETTINGS,
  MINIMAP_MAX_PICKUPS,
  MINIMAP_PADDING,
  MINIMAP_PICKUP_KINDS,
  MINIMAP_RANGE,
  MINIMAP_SETTING_KEYS,
} from '../config/minimap';
import type { SaveSettings } from './save';
import {
  buildMinimapView,
  dropUnknownMinimapKeys,
  clipSegment,
  readMinimapSettings,
  writeMinimapSettings,
  type MinimapFrame,
} from './minimap';

const BOX = 120;
const ARENA = { width: 3000, height: 3000 };

function frame(over: Partial<MinimapFrame> = {}): MinimapFrame {
  return {
    settings: { ...DEFAULT_MINIMAP_SETTINGS, enemies: true },
    arena: ARENA,
    player: { x: 1500, y: 1500 },
    view: { x: 1020, y: 1230, width: 960, height: 540 },
    boss: null,
    pickups: [],
    enemies: [],
    ...over,
  };
}

describe('readMinimapSettings', () => {
  it('gives the defaults for an empty save', () => {
    expect(readMinimapSettings({})).toEqual(DEFAULT_MINIMAP_SETTINGS);
  });

  it('round-trips what writeMinimapSettings stored', () => {
    const settings = {
      ...DEFAULT_MINIMAP_SETTINGS,
      on: false,
      pickups: false,
      enemies: true,
      relic: false,
      gem: true,
    };
    expect(readMinimapSettings(writeMinimapSettings({}, settings))).toEqual(settings);
  });

  it.each([['false'], ['true'], [0], [1], [NaN], [null], [undefined]])(
    'falls back to the default for %j',
    (value) => {
      const saved = Object.fromEntries(
        Object.values(MINIMAP_SETTING_KEYS).map((key) => [key, value]),
      ) as unknown as SaveSettings;
      expect(readMinimapSettings(saved)).toEqual(DEFAULT_MINIMAP_SETTINGS);
    },
  );

  it('gives an old save, which has none of the pickup kind switches, their defaults', () => {
    const settings = readMinimapSettings({ 'minimap.on': false, 'minimap.pickups': false });
    expect(settings).toEqual({ ...DEFAULT_MINIMAP_SETTINGS, on: false, pickups: false });
    expect(settings.gem).toBe(false);
    expect(settings.relic).toBe(true);
  });

  it('ignores a key that only the prototype has', () => {
    const saved = Object.create({ 'minimap.on': false }) as SaveSettings;
    expect(readMinimapSettings(saved).on).toBe(true);
  });
});

describe('writeMinimapSettings', () => {
  it('keeps the other keys and writes every switch as booleans', () => {
    const written = writeMinimapSettings(
      { 'audio.master': 0.5, 'feedback.shake': 1 },
      {
        ...DEFAULT_MINIMAP_SETTINGS,
      },
    );
    expect(written['audio.master']).toBe(0.5);
    expect(written['feedback.shake']).toBe(1);
    for (const key of Object.values(MINIMAP_SETTING_KEYS)) {
      expect(typeof written[key]).toBe('boolean');
    }
  });
});

describe('dropUnknownMinimapKeys', () => {
  it('keeps the allowed switches and every non-minimap key', () => {
    const saved = { 'minimap.on': false, 'audio.master': 0.3, name: 'x' };
    expect(dropUnknownMinimapKeys(saved)).toEqual(saved);
  });

  it('drops unknown minimap keys, including look-alikes and invisible characters', () => {
    const saved: SaveSettings = {
      'minimap.on': true,
      'minimap.evil': true,
      'minimap.__proto__': true,
      'minimap.on\u200B': true,
      'minimap.\u202Eno': true,
      'minimap.\u043En': true,
      'Minimap.on': true,
    };
    expect(Object.keys(dropUnknownMinimapKeys(saved)).sort()).toEqual(['Minimap.on', 'minimap.on']);
  });

  it('drops a primitive __proto__ key without touching the prototype', () => {
    const saved = JSON.parse('{"__proto__": true, "minimap.on": false}') as SaveSettings;
    const kept = dropUnknownMinimapKeys(saved);
    expect(Object.hasOwn(kept, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(readMinimapSettings(kept).on).toBe(false);
  });

  it('drops an allowed key whose value is not a boolean', () => {
    expect(dropUnknownMinimapKeys({ 'minimap.on': 'yes', 'minimap.boss': 1 })).toEqual({});
  });

  it('keeps the pickup kind switches and drops look-alikes of them (#383)', () => {
    const saved: SaveSettings = {
      'minimap.pickups.relic': false,
      'minimap.pickups.gem': true,
      'minimap.pickups.health': 'true',
      'minimap.pickups.ember': null as unknown as boolean,
      'minimap.pickups.health.x': true,
      'minimap.pickups.constructor': true,
      'minimap.pickups.re\u200Blic': true,
      'minimap.pickups.\u202Egem': true,
      'minimap.pickups.\u0433em': true,
      [`minimap.pickups.${'a'.repeat(100_000)}`]: true,
    };
    expect(dropUnknownMinimapKeys(saved)).toEqual({
      'minimap.pickups.relic': false,
      'minimap.pickups.gem': true,
    });
  });

  it('reads defaults for hostile values of the pickup kind switches (#383)', () => {
    const saved = JSON.parse(
      '{"minimap.pickups.relic":"true","minimap.pickups.gem":1,"minimap.pickups.ember":{"__proto__":{"x":1}},"minimap.pickups.health":[],"__proto__":true}',
    ) as SaveSettings;
    expect(readMinimapSettings(dropUnknownMinimapKeys(saved))).toEqual(DEFAULT_MINIMAP_SETTINGS);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('leaves none of 10,000 junk minimap keys', () => {
    const saved: SaveSettings = {};
    for (let i = 0; i < 10_000; i++) saved[`minimap.junk${i}`] = true;
    expect(dropUnknownMinimapKeys(saved)).toEqual({});
  });
});

const C = BOX / 2;
const R = C - MINIMAP_PADDING;
const SCALE = R / MINIMAP_RANGE;

describe('clipSegment', () => {
  const at = (x1: number, y1: number, x2: number, y2: number) =>
    clipSegment({ x: x1, y: y1 }, { x: x2, y: y2 }, 10);

  it('keeps a segment fully inside', () => {
    expect(at(-5, 0, 5, 0)).toEqual({ a: { x: -5, y: 0 }, b: { x: 5, y: 0 } });
  });

  it('drops a segment fully outside', () => {
    expect(at(20, -5, 20, 5)).toBeNull();
    expect(at(-30, 20, 30, 20)).toBeNull();
  });

  it('cuts a segment that crosses the rim once', () => {
    const clipped = at(0, 0, 30, 0);
    expect(clipped?.a.x).toBeCloseTo(0);
    expect(clipped?.b.x).toBeCloseTo(10);
  });

  it('cuts both ends of a segment that crosses twice', () => {
    const clipped = at(-30, 6, 30, 6);
    expect(clipped?.a.x).toBeCloseTo(-8);
    expect(clipped?.b.x).toBeCloseTo(8);
    expect(clipped?.a.y).toBeCloseTo(6);
  });

  it('shows nothing for a tangent touch', () => {
    expect(at(-30, 10, 30, 10)).toBeNull();
  });

  it('shows nothing for a zero-length segment', () => {
    expect(at(1, 1, 1, 1)).toBeNull();
  });

  it('ends a cut segment on the rim, whichever way it runs', () => {
    for (const clipped of [at(-30, 6, 30, 6), at(30, 6, -30, 6), at(25, 25, 0, 0)]) {
      expect(clipped).not.toBeNull();
      const ends = [clipped?.a, clipped?.b].map((p) => Math.hypot(p?.x ?? 0, p?.y ?? 0));
      expect(ends.some((d) => Math.abs(d - 10) < 1e-9)).toBe(true);
    }
    const back = at(30, 6, -30, 6);
    expect(back?.a.x).toBeCloseTo(8);
    expect(back?.b.x).toBeCloseTo(-8);
  });

  it('shows nothing for a NaN input', () => {
    expect(at(Number.NaN, 0, 5, 0)).toBeNull();
  });
});

describe('buildMinimapView', () => {
  it('puts the player at the circle centre wherever it is', () => {
    for (const player of [
      { x: 1500, y: 1500 },
      { x: 0, y: 3000 },
      { x: -500, y: 9000 },
    ]) {
      const view = buildMinimapView(frame({ player }), BOX);
      expect(view.player).toEqual({ x: C, y: C });
    }
  });

  it('projects a point +range on x to the rim', () => {
    const view = buildMinimapView(
      frame({ boss: { x: 1500 + MINIMAP_RANGE, y: 1500 }, enemies: [1500, 1500] }),
      BOX,
    );
    expect(view.boss?.x).toBeCloseTo(C + R);
    expect(view.boss?.y).toBeCloseTo(C);
    expect(view.boss?.pinned).toBe(false);
    expect(view.enemies[0]).toBeCloseTo(C);
    expect(view.enemies[1]).toBeCloseTo(C);
  });

  it('hides the arena edge with the player at the arena centre and shows it near the edge', () => {
    expect(buildMinimapView(frame(), BOX).arena).toEqual([]);
    const near = buildMinimapView(frame({ player: { x: 400, y: 1500 } }), BOX).arena;
    expect(near.length).toBeGreaterThan(0);
    // The left edge lies 400 world px to the left of the player.
    expect(near[0]?.x1).toBeCloseTo(C - 400 * SCALE);
    for (const s of near) {
      for (const [x, y] of [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ] as const) {
        expect(Math.hypot(x - C, y - C)).toBeLessThanOrEqual(R + 1e-6);
      }
    }
  });

  it('shows two edges near a corner', () => {
    expect(buildMinimapView(frame({ player: { x: 300, y: 300 } }), BOX).arena).toHaveLength(2);
  });

  it('clips the viewport outline to the circle', () => {
    const view = buildMinimapView(frame(), BOX);
    // The 960 x 540 view fits inside the range, so all four sides show whole.
    expect(view.viewport).toHaveLength(4);
    const wide = buildMinimapView(frame({ view: { x: 0, y: 0, width: 3000, height: 3000 } }), BOX);
    expect(wide.viewport).toEqual([]);
  });

  it('keeps only off-screen pickups, chests included, the view edge counting as on screen', () => {
    const view = buildMinimapView(
      frame({
        pickups: [
          { kind: 'health', x: 1500 + 700, y: 1500 },
          { kind: 'chest', x: 1500, y: 1500 - 600 },
          { kind: 'bomb', x: 1500, y: 1500 },
          { kind: 'magnet', x: 1020, y: 1230 },
        ],
      }),
      BOX,
    );
    expect(view.pickups.map((p) => p.kind)).toEqual(['chest', 'health']);
    expect(view.pickups[1]?.x).toBeCloseTo(C + 700 * SCALE);
    expect(view.pickups[1]?.pinned).toBe(false);
  });

  it('draws only the nearest pickups when there are more than the cap, nearest first', () => {
    const count = MINIMAP_MAX_PICKUPS + 10;
    // Off screen and in range, listed far to near, so the cut must come from distance, not order.
    const pickups = Array.from({ length: count }, (_, i) => ({
      kind: 'health' as const,
      x: 1500,
      y: 1500 + 300 + (count - 1 - i) * 10,
    }));
    const view = buildMinimapView(frame({ pickups }), BOX);
    expect(view.pickups).toHaveLength(MINIMAP_MAX_PICKUPS);
    const ys = view.pickups.map((p) => p.y);
    expect(ys).toEqual([...ys].sort((p, q) => p - q));
    expect(ys[0]).toBeCloseTo(C + 300 * SCALE);
    expect(ys[ys.length - 1]).toBeCloseTo(C + (300 + (MINIMAP_MAX_PICKUPS - 1) * 10) * SCALE);
  });

  const KINDS = MINIMAP_PICKUP_KINDS;
  const everyKind = KINDS.map((kind, i) => ({ kind, x: 1500 + 600 + i * 20, y: 1500 }));
  const allOn = { ...DEFAULT_MINIMAP_SETTINGS, gem: true };

  it('maps relics, Embers and gems like the other pickups (#383)', () => {
    const view = buildMinimapView(frame({ settings: allOn, pickups: everyKind }), BOX);
    expect(view.pickups.map((p) => p.kind).sort()).toEqual([...KINDS].sort());
    for (const p of view.pickups) {
      const world = everyKind.find((w) => w.kind === p.kind);
      expect(p.x).toBeCloseTo(C + ((world?.x ?? 0) - 1500) * SCALE);
      expect(p.y).toBeCloseTo(C);
    }
  });

  it.each(KINDS)('the %s switch hides only its own kind (#383)', (kind) => {
    const view = buildMinimapView(
      frame({ settings: { ...allOn, [kind]: false }, pickups: everyKind }),
      BOX,
    );
    expect(view.pickups.map((p) => p.kind).sort()).toEqual(KINDS.filter((k) => k !== kind).sort());
  });

  it('hides every kind with Pickups off, whatever the kind switches say (#383)', () => {
    const view = buildMinimapView(
      frame({ settings: { ...allOn, pickups: false }, pickups: everyKind }),
      BOX,
    );
    expect(view.pickups).toEqual([]);
  });

  it('keeps a far relic and the near health on the map under 200 nearer gems (#383)', () => {
    const gems = Array.from({ length: 200 }, (_, i) => ({
      kind: 'gem' as const,
      x: 1500 + 600 + (i % 20),
      y: 1500 + Math.floor(i / 20),
    }));
    const view = buildMinimapView(
      frame({
        settings: allOn,
        pickups: [
          ...gems,
          { kind: 'relic', x: 1500 + 950, y: 1500 },
          { kind: 'health', x: 1500, y: 2300 },
        ],
      }),
      BOX,
    );
    const kinds = view.pickups.map((p) => p.kind);
    expect(view.pickups).toHaveLength(MINIMAP_MAX_PICKUPS);
    expect(kinds).toContain('relic');
    expect(kinds).toContain('health');
    expect(kinds.filter((k) => k === 'gem')).toHaveLength(MINIMAP_MAX_PICKUPS - 2);
  });

  it('pins the boss and pickups beyond the range to the rim along their direction', () => {
    const view = buildMinimapView(
      frame({
        boss: { x: 0, y: 1500 },
        pickups: [{ kind: 'bomb', x: 1500 + 3000, y: 1500 - 4000 }],
      }),
      BOX,
    );
    expect(view.boss).toEqual({ x: expect.closeTo(C - R) as number, y: C, pinned: true });
    const pin = view.pickups[0];
    expect(pin?.pinned).toBe(true);
    expect(Math.hypot((pin?.x ?? 0) - C, (pin?.y ?? 0) - C)).toBeCloseTo(R);
    expect((pin?.x ?? 0) - C).toBeCloseTo(R * 0.6);
    expect((pin?.y ?? 0) - C).toBeCloseTo(-R * 0.8);
  });

  it('drops enemies outside the circle without pinning them', () => {
    const view = buildMinimapView(
      frame({ enemies: [1500 + 500, 1500, 1500 + 1500, 1500, 1500 + 800, 1500 + 800] }),
      BOX,
    );
    expect(view.enemies).toHaveLength(2);
    expect(view.enemies[0]).toBeCloseTo(C + 500 * SCALE);
  });

  it('comes out empty for every layer whose switch is off', () => {
    const off = {
      ...DEFAULT_MINIMAP_SETTINGS,
      viewport: false,
      boss: false,
      pickups: false,
      enemies: false,
    };
    const view = buildMinimapView(
      frame({
        settings: off,
        boss: { x: 10, y: 10 },
        pickups: [{ kind: 'health', x: 100, y: 100 }],
        enemies: [1500, 1500],
      }),
      BOX,
    );
    expect(view.viewport).toBeNull();
    expect(view.boss).toBeNull();
    expect(view.pickups).toEqual([]);
    expect(view.enemies).toEqual([]);
  });

  it('shows no boss marker before the boss spawns', () => {
    expect(buildMinimapView(frame({ boss: null }), BOX).boss).toBeNull();
  });
});
