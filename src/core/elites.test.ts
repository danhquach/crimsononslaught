import { describe, expect, it } from 'vitest';
import { ELITE, ENEMY_ARCHETYPES } from '../config/enemies';
import { ELITE_SCHEDULE, type EliteEntry } from '../config/waves';
import { EliteQueue, dueElites, eliteGemCount, eliteScale, placeElite } from './elites';
import { scaleArchetype } from './enemy';
import { gemDropCount } from './gems';
import { createRng, deriveSeed } from './rng';
import { spawnRingRadius } from './spawnDirector';
import { activeWave } from './waveSchedule';

const VIEW = { width: 960, height: 540 };
const WORLD = { width: 3000, height: 3000 };
const CENTER = { x: 1500, y: 1500 };

describe('dueElites', () => {
  it('yields an entry in the one frame whose window (t, t + dt] holds it', () => {
    const [first] = ELITE_SCHEDULE;
    const at = first!.at;
    expect(dueElites(at - 1, 0.5)).toEqual([]);
    expect(dueElites(at - 0.5, 0.5).map((d) => d.type)).toEqual([first!.type]);
    // The frame that starts on it has already had it.
    expect(dueElites(at, 0.5)).toEqual([]);
  });

  it('lands every entry exactly once, whatever the frame length', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.25, 7]) {
      const seen: string[] = [];
      for (let t = 0; t < 1200; t += dt) seen.push(...dueElites(t, dt).map((d) => d.type));
      expect(seen, String(dt)).toEqual(ELITE_SCHEDULE.map((e) => e.type));
    }
  });

  it('carries the multipliers of the wave the elite lands in', () => {
    for (const { at } of ELITE_SCHEDULE) {
      const [due] = dueElites(at - 0.01, 0.01);
      const wave = activeWave(at);
      expect(due!.scale, String(at)).toEqual({ hpMul: wave.hpMul, damageMul: wave.damageMul });
    }
  });

  it('skips entries already past for a run that starts late (?startAt=)', () => {
    const late = ELITE_SCHEDULE[3]!.at + 1;
    expect(dueElites(late, 1 / 60)).toEqual([]);
  });

  it('returns several entries a long frame spans, in schedule order', () => {
    const schedule: EliteEntry[] = [
      { at: 10, type: 'tank' },
      { at: 11, type: 'swarm' },
    ];
    expect(dueElites(9, 5, schedule).map((d) => d.type)).toEqual(['tank', 'swarm']);
  });

  it('fields nothing in the boss phase', () => {
    expect(dueElites(1199, 5, [{ at: 1201, type: 'tank' }])).toEqual([]);
  });
});

describe('eliteScale', () => {
  it('multiplies the wave’s hp and damage by the elite’s', () => {
    expect(eliteScale({ hpMul: 2, damageMul: 1.5 })).toEqual({
      hpMul: 2 * ELITE.hpMul,
      damageMul: 1.5 * ELITE.damageMul,
    });
  });

  it('makes every scheduled elite tougher and no weaker-hitting than its crowd', () => {
    for (const { at, type } of ELITE_SCHEDULE) {
      const [due] = dueElites(at - 0.01, 0.01);
      const crowd = scaleArchetype(ENEMY_ARCHETYPES[type], due!.scale);
      const elite = scaleArchetype(ENEMY_ARCHETYPES[type], eliteScale(due!.scale));
      expect(elite.hp, `${type} at ${at}`).toBeGreaterThan(crowd.hp);
      expect(elite.contactDamage, `${type} at ${at}`).toBeGreaterThanOrEqual(crowd.contactDamage);
      expect(elite.speed).toBe(crowd.speed);
      expect(elite.radius).toBe(crowd.radius);
    }
  });
});

describe('eliteGemCount', () => {
  it('is its type’s gems, ELITE.gemMul times over', () => {
    expect(eliteGemCount('swarm')).toBe(gemDropCount('swarm') * ELITE.gemMul);
    expect(eliteGemCount('tank')).toBe(gemDropCount('tank') * ELITE.gemMul);
    expect(eliteGemCount('swarm')).toBe(3);
  });
});

describe('placeElite', () => {
  it('puts an elite on the spawn ring, outside the view', () => {
    const rng = createRng(deriveSeed(1, 'elites'));
    const radius = spawnRingRadius(VIEW);
    for (let i = 0; i < 50; i += 1) {
      const p = placeElite(rng, CENTER, VIEW, WORLD);
      expect(Math.hypot(p.x - CENTER.x, p.y - CENTER.y)).toBeCloseTo(radius, 6);
    }
  });

  it('takes exactly one draw per elite, so a seed places the same elites', () => {
    const a = createRng(7);
    const b = createRng(7);
    placeElite(a, CENTER, VIEW, WORLD);
    b.next();
    expect(a.next()).toBe(b.next());
    const again = createRng(7);
    expect(placeElite(again, CENTER, VIEW, WORLD)).toEqual(
      placeElite(createRng(7), CENTER, VIEW, WORLD),
    );
  });
});

describe('EliteQueue', () => {
  const NONE = new Set<never>();
  const SCHEDULE: EliteEntry[] = [
    { at: 200, type: 'tank' },
    { at: 201, type: 'fast' },
  ];

  it('places an elite the frame it falls due when there is room', () => {
    const queue = new EliteQueue();
    const placed: string[] = [];
    const room = (due: { type: string }) => (placed.push(due.type), true);
    expect(queue.step(199, 0.5, NONE, room, SCHEDULE)).toBe(0);
    expect(queue.step(199.5, 0.5, NONE, room, SCHEDULE)).toBe(1);
    expect(placed).toEqual(['tank']);
    expect(queue.length).toBe(0);
  });

  it('holds an elite due at the cap and places it the first frame there is room', () => {
    const queue = new EliteQueue();
    let room = false;
    const placed: string[] = [];
    const trySpawn = (due: { type: string }) => room && (placed.push(due.type), true);
    queue.step(199.5, 0.5, NONE, trySpawn, SCHEDULE);
    queue.step(200, 1, NONE, trySpawn, SCHEDULE);
    expect(queue.length).toBe(2);
    expect(placed).toEqual([]);
    // Still full for a while: nothing is lost and nothing is placed.
    for (let t = 201; t < 230; t += 1) queue.step(t, 1, NONE, trySpawn, SCHEDULE);
    expect(queue.length).toBe(2);
    room = true;
    expect(queue.step(230, 1, NONE, trySpawn, SCHEDULE)).toBe(2);
    expect(placed).toEqual(['tank', 'fast']);
  });

  it('places the oldest first and stops at the first refusal', () => {
    const queue = new EliteQueue();
    let slots = 1;
    const placed: string[] = [];
    const trySpawn = (due: { type: string }) => slots > 0 && (slots--, placed.push(due.type), true);
    expect(queue.step(199, 5, NONE, trySpawn, SCHEDULE)).toBe(1);
    expect(placed).toEqual(['tank']);
    expect(queue.length).toBe(1);
  });

  it('lets in only the types `?enemies=` lists', () => {
    const queue = new EliteQueue();
    const placed: string[] = [];
    queue.step(199, 5, new Set(['fast'] as const), (d) => (placed.push(d.type), true), SCHEDULE);
    expect(placed).toEqual(['fast']);
  });

  it('drops whatever is waiting when the boss arrives', () => {
    const queue = new EliteQueue();
    queue.step(1100, 50, NONE, () => false, [{ at: 1140, type: 'shielded' }]);
    expect(queue.length).toBe(1);
    const placed: string[] = [];
    queue.step(1199.9, 0.2, NONE, (d) => (placed.push(d.type), true));
    expect(queue.length).toBe(0);
    expect(placed).toEqual([]);
  });
});
