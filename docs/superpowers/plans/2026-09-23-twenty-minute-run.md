# 20-Minute Run Implementation Plan (#127)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run lasts 20 minutes with the boss at 20:00. Later waves scale enemy
HP and contact damage. `?startAt=` lets tests start the clock late.

**Architecture:**
- The data change lives in `config/waves.ts`: 10 two-minute rows plus the boss
  row, each with `hpMul` and `damageMul`.
- The wave that plans a spawn stamps its multipliers on the `SpawnRequest`.
  `SpawnDirector` passes them through `EnemyPool.spawn` to `Enemy.spawn`, which
  applies them through a pure `scaleArchetype` in `core/enemy.ts`.
- `RunState` takes a start time; Boot resolves `?startAt=` into the registry,
  as it does for `?timeScale=`.
- The phase machine and the win/lose rules are untouched.

**Tech Stack:** Vite + TypeScript + Phaser 3, Vitest (`src/core/**`,
`src/config/**`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-23-twenty-minute-run-design.md` §2.

## Global Constraints

- RNG only via `src/core/rng.ts` (no `Math.random`). `planSpawns` must keep
  exactly two RNG draws per spawn (type, then angle), so seeded runs keep their
  spawn sequence.
- There are no Phaser imports in `src/core/**` or `src/config/**`.
- `BOSS_START_TIME = 1200`. `BOSS.hp = 7200`.
- `MAX_LIVE_ENEMIES` stays 300.
- Public repo: no local paths, usernames or commercial game names in code,
  comments, commits or the PR.
- Commit only after QA, review and PM approval (CLAUDE.md). Commit identity is
  repo-local.
- QA gate: `npm ci && npm run lint && npm test && npm run build && npm run test:e2e`.
  Run e2e alone, with at most 2 concurrent Playwright or Phaser runs.

---

### Task 1: Wave table and boss HP (data)

**Files:**
- Modify: `src/config/waves.ts` (the `Wave` interface, `WAVES`, `BOSS_START_TIME` and their doc comments)
- Modify: `src/config/boss.ts` (`hp: 2400` becomes `7200`)
- Test: `src/config/waves.test.ts`, `src/config/boss.test.ts:7`, `src/core/waveSchedule.test.ts`, `src/core/spawnDirector.test.ts`

**Interfaces:**
- Produces: `Wave { startTime; types; spawnsPerSecond; hpMul; damageMul }`,
  `WAVES` (11 rows) and `BOSS_START_TIME = 1200`.

- [ ] **Step 1: Rewrite `src/config/waves.test.ts` for the new table**

  Replace the "matches the spec §5 spawn schedule" test with:

```ts
  it('matches the 20-minute schedule', () => {
    const all = ['swarm', 'fast', 'tank'] as const;
    expect(WAVES).toEqual([
      { startTime: 0, types: ['swarm'], spawnsPerSecond: 1.5, hpMul: 1, damageMul: 1 },
      { startTime: 120, types: ['swarm', 'fast'], spawnsPerSecond: 2, hpMul: 1.2, damageMul: 1.1 },
      { startTime: 240, types: all, spawnsPerSecond: 2.5, hpMul: 1.4, damageMul: 1.2 },
      { startTime: 360, types: all, spawnsPerSecond: 3, hpMul: 1.6, damageMul: 1.3 },
      { startTime: 480, types: all, spawnsPerSecond: 3.5, hpMul: 1.8, damageMul: 1.4 },
      { startTime: 600, types: all, spawnsPerSecond: 4, hpMul: 2, damageMul: 1.5 },
      { startTime: 720, types: all, spawnsPerSecond: 4.5, hpMul: 2.2, damageMul: 1.6 },
      { startTime: 840, types: all, spawnsPerSecond: 5, hpMul: 2.4, damageMul: 1.7 },
      { startTime: 960, types: all, spawnsPerSecond: 5.5, hpMul: 2.6, damageMul: 1.8 },
      { startTime: 1080, types: all, spawnsPerSecond: 6, hpMul: 2.8, damageMul: 1.9 },
      { startTime: 1200, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 },
    ]);
  });

  it('never eases off: rate and multipliers climb or hold until the boss', () => {
    const waves = WAVES.slice(0, -1);
    for (let i = 1; i < waves.length; i += 1) {
      const [prev, next] = [waves[i - 1]!, waves[i]!];
      const at = String(next.startTime);
      expect(next.spawnsPerSecond, at).toBeGreaterThanOrEqual(prev.spawnsPerSecond);
      expect(next.hpMul, at).toBeGreaterThanOrEqual(prev.hpMul);
      expect(next.damageMul, at).toBeGreaterThanOrEqual(prev.damageMul);
    }
  });

  it('scales by a positive multiplier on every row', () => {
    for (const wave of WAVES) {
      expect(wave.hpMul, String(wave.startTime)).toBeGreaterThan(0);
      expect(wave.damageMul, String(wave.startTime)).toBeGreaterThan(0);
    }
  });
```

  Then change the boss test to "ends with the silent boss wave at 20:00".
  It should check `BOSS_START_TIME` is `1200`, and that the last row is
  `{ startTime: BOSS_START_TIME, types: [], spawnsPerSecond: 0, hpMul: 1, damageMul: 1 }`.
  In `boss.test.ts:7`, change `hp: 2400` to `hp: 7200`.

- [ ] **Step 2: Run to see it fail**

  Run: `npx vitest run src/config/waves.test.ts src/config/boss.test.ts`
  Expected: FAIL on the table, the boss time and the boss HP.

- [ ] **Step 3: Implement the data**

  In `src/config/waves.ts`, add two fields to `Wave`:

```ts
  /** Multiplies the archetype's hp for enemies this wave spawns. 1 is the table in `enemies.ts`. */
  hpMul: number;
  /** Multiplies the archetype's contact damage for enemies this wave spawns. */
  damageMul: number;
```

  Replace `WAVES` with the 11 rows from Step 1, and set
  `BOSS_START_TIME = 1200`. Update the doc comments: the run is 20:00 and the
  boss spawns at 20:00 (#127), replacing the "5:00" wording. In
  `src/config/boss.ts`, set `hp: 7200` with the comment
  `// #127: sized for a 20-minute build; starting value, tune later.`

- [ ] **Step 4: Generalise the schedule tests that hard-code 60/300**

  `src/core/waveSchedule.test.ts`:
  - `RATE`: drop the fixed 6-tuple cast. Use
    `const RATE = WAVES.map((w) => w.spawnsPerSecond);` and index it with
    non-null `!`.
  - `activeWave` boundaries: read them from the table, not the literals:

```ts
  it('holds a wave up to the instant the next one starts', () => {
    for (let i = 1; i < WAVES.length; i += 1) {
      const start = WAVES[i]!.startTime;
      expect(activeWave(start - 0.1), String(start)).toBe(WAVES[i - 1]);
      expect(activeWave(start), String(start)).toBe(WAVES[i]);
    }
  });

  it('switches to the boss wave at BOSS_START_TIME and stays there', () => {
    const boss = WAVES[WAVES.length - 1];
    expect(activeWave(BOSS_START_TIME)).toBe(boss);
    expect(activeWave(BOSS_START_TIME * 2)).toBe(boss);
  });
```

  - "pays each wave its own rate": change `WAVES.slice(0, 5)` to
    `WAVES.slice(0, -1)`.
  - Every literal `300`, `299.9` or `305`: use `BOSS_START_TIME`,
    `BOSS_START_TIME - 0.1` and `BOSS_START_TIME + 5`.
  - `RATE[4]`: use `RATE[RATE.length - 2]!`.
  - `59.5` and `RATE[1]`: use `WAVES[1]!.startTime - 0.5`.

  Rename the "yields nothing from 300 s on" test to "yields nothing from the
  boss on".

  `src/core/spawnDirector.test.ts`: it already uses `BOSS_START_TIME` and
  `WAVES[0]`. Check that no literal wave time remains:
  `grep -n "60\b\|120\|300" src/core/spawnDirector.test.ts`.

- [ ] **Step 5: Run the unit suite**

  Run: `npx vitest run src/config src/core/waveSchedule.test.ts src/core/spawnDirector.test.ts src/core/runState.test.ts`
  Expected: PASS. `runState.test.ts` reads `BOSS_START_MS` symbolically, so
  it follows. One loop ticks up to `BOSS_START_MS / 160`, which is now 7500
  ticks — acceptable.

### Task 2: Scale enemies by the wave that spawned them

**Files:**
- Modify: `src/core/enemy.ts` (add `WaveScale`, `UNSCALED` and `scaleArchetype`)
- Modify: `src/core/spawnDirector.ts` (`SpawnRequest` gains `scale`; `planSpawns` stamps it)
- Modify: `src/systems/SpawnDirector.ts:51`, `src/systems/EnemyPool.ts` (`spawn`), `src/entities/Enemy.ts` (`spawn`, `contactDamage`)
- Test: `src/core/enemy.test.ts`, `src/core/spawnDirector.test.ts`

**Interfaces:**
- Consumes: `Wave.hpMul` and `Wave.damageMul` (Task 1).
- Produces:
  - `interface WaveScale { readonly hpMul: number; readonly damageMul: number }`;
  - `const UNSCALED: WaveScale`;
  - `scaleArchetype(a: Readonly<EnemyArchetype>, s: Readonly<WaveScale>): EnemyArchetype`;
  - `SpawnRequest.scale: WaveScale`;
  - `EnemyPool.spawn(type, x, y, scale = UNSCALED)`;
  - `Enemy.spawn(type, x, y, scale = UNSCALED)`.

- [ ] **Step 1: Failing tests**

  In `src/core/enemy.test.ts`:

```ts
import { ENEMY_ARCHETYPES } from '../config/enemies';
import { UNSCALED, scaleArchetype } from './enemy';

describe('scaleArchetype', () => {
  it('leaves the row alone at 1x', () => {
    expect(scaleArchetype(ENEMY_ARCHETYPES.tank, UNSCALED)).toEqual(ENEMY_ARCHETYPES.tank);
  });

  it('scales hp and contact damage, rounded to whole numbers, and nothing else', () => {
    const scaled = scaleArchetype(ENEMY_ARCHETYPES.tank, { hpMul: 2.8, damageMul: 1.9 });
    expect(scaled).toEqual({ ...ENEMY_ARCHETYPES.tank, hp: 168, contactDamage: 29 });
  });

  it('never scales a stat below 1', () => {
    const scaled = scaleArchetype(ENEMY_ARCHETYPES.fast, { hpMul: 0.01, damageMul: 0.01 });
    expect(scaled.hp).toBe(1);
    expect(scaled.contactDamage).toBe(1);
  });
});
```

  In `src/core/spawnDirector.test.ts`:

```ts
  it('stamps every spawn with the multipliers of the wave that planned it', () => {
    const wave = WAVES[3]!;
    const plan = planSpawns({
      t: wave.startTime, dt: 2, carry: 0, rng: createRng(1),
      view: VIEW, center: CENTER, world: WORLD,
    });
    expect(plan.spawns.length).toBeGreaterThan(0);
    for (const s of plan.spawns) {
      expect(s.scale).toEqual({ hpMul: wave.hpMul, damageMul: wave.damageMul });
    }
  });
```

  Use the file's existing `VIEW`, `CENTER` and `WORLD` constants and its
  `createRng` import. Add any that are missing.

- [ ] **Step 2: Run to see it fail**

  Run: `npx vitest run src/core/enemy.test.ts src/core/spawnDirector.test.ts`
  Expected: FAIL (`scaleArchetype` / `UNSCALED` not exported; `scale` undefined).

- [ ] **Step 3: Implement the core**

  In `src/core/enemy.ts`:

```ts
import type { EnemyArchetype } from '../config/enemies';

/** What a wave does to the archetype rows it spawns (#127). */
export interface WaveScale {
  readonly hpMul: number;
  readonly damageMul: number;
}

/** The table as written: the Phase 1 stats. */
export const UNSCALED: WaveScale = { hpMul: 1, damageMul: 1 };

/**
 * An archetype row as a wave spawns it: hp and contact damage multiplied and
 * rounded to whole numbers, never below 1. Speed, radius and texture are the
 * row's own.
 */
export function scaleArchetype(
  archetype: Readonly<EnemyArchetype>,
  scale: Readonly<WaveScale>,
): EnemyArchetype {
  return {
    ...archetype,
    hp: Math.max(1, Math.round(archetype.hp * scale.hpMul)),
    contactDamage: Math.max(1, Math.round(archetype.contactDamage * scale.damageMul)),
  };
}
```

  In `src/core/spawnDirector.ts`:
  - `SpawnRequest` gains `readonly scale: WaveScale;`, imported as a type
    from `./enemy`;
  - in `planSpawns`, destructure
    `const { types, hpMul, damageMul } = activeWave(t + dt);`;
  - build `const scale: WaveScale = { hpMul, damageMul };` once, and push
    `{ type, x, y, scale }`;
  - do not add RNG draws.

- [ ] **Step 4: Wire the Phaser side**

  - `src/systems/SpawnDirector.ts:51` becomes
    `this.pool.spawn(request.type, request.x, request.y, request.scale);`.
  - `src/systems/EnemyPool.ts`:
    `spawn(type: EnemyType, x: number, y: number, scale: Readonly<WaveScale> = UNSCALED)`,
    forwarding `enemy.spawn(type, x, y, scale)`.
  - `src/entities/Enemy.ts`:
    - add the field `private contact = ENEMY_ARCHETYPES.swarm.contactDamage;`;
    - `get contactDamage()` returns `this.contact`;
    - `spawn` becomes:

```ts
  /** Take this pooled object out of the pool as `type`, alive at (x, y), scaled by the wave that spawned it (#127). */
  spawn(type: EnemyType, x: number, y: number, scale: Readonly<WaveScale> = UNSCALED): void {
    this.kind = type;
    const stats = scaleArchetype(ENEMY_ARCHETYPES[type], scale);
    this.contact = stats.contactDamage;
    this.arise(stats, x, y);
  }
```

  `Boss` overrides `contactDamage`, so it is unaffected. `CollisionDebugScene`
  calls `spawn('tank', …)` and takes the default.

- [ ] **Step 5: Run unit + typecheck**

  Run: `npx vitest run && npx tsc --noEmit`
  Expected: PASS, no type errors.

### Task 3: `?startAt=` test hook

**Files:**
- Modify: `src/core/runState.ts` (`resolveStartAt`, and the `RunState` constructor's `startMs`)
- Modify: `src/core/scenePayloads.ts` (`START_AT_REGISTRY_KEY`), `src/scenes/BootScene.ts:85-91`, `src/scenes/GameScene.ts:422`
- Test: `src/core/runState.test.ts`

**Interfaces:**
- Produces:
  - `resolveStartAt(search: string): number` (ms);
  - `new RunState(emitter, timeScale = 1, startMs = 0)`;
  - `START_AT_REGISTRY_KEY = 'startAt'`.

- [ ] **Step 1: Failing tests** (append to `src/core/runState.test.ts`)

```ts
describe('resolveStartAt', () => {
  it('reads seconds into ms', () => {
    expect(resolveStartAt('?startAt=1190')).toBe(1_190_000);
    expect(resolveStartAt('?startAt=0.5')).toBe(500);
  });

  it('reads anything absent, unparseable, negative or not before the boss as 0', () => {
    for (const search of ['', '?startAt=', '?startAt=abc', '?startAt=-5',
      `?startAt=${BOSS_START_TIME}`, '?startAt=Infinity']) {
      expect(resolveStartAt(search), search).toBe(0);
    }
  });
});

describe('RunState start time', () => {
  it('starts the clock at startMs and counts on from there', () => {
    const { emitter, events } = recorder();
    const run = new RunState(emitter, 1, 1_000_000);
    expect(run.elapsedMs).toBe(1_000_000);
    run.tick(16);
    expect(events).toContainEqual({ name: 'timer', payload: { elapsedMs: 1_000_016 } });
  });

  it('crosses into the boss phase at the same clock time as a full run', () => {
    const { emitter } = recorder();
    const run = new RunState(emitter, 1, BOSS_START_MS - 10);
    run.tick(9);
    expect(run.phase).toBe('waves');
    run.tick(1);
    expect(run.phase).toBe('boss');
  });

  it('ignores a start time that is not a usable clock value', () => {
    const { emitter } = recorder();
    expect(new RunState(emitter, 1, -5).elapsedMs).toBe(0);
    expect(new RunState(emitter, 1, Number.NaN).elapsedMs).toBe(0);
  });
});
```

  Use the file's existing fake emitter helper; rename `recorder()` to whatever
  it is called there.

- [ ] **Step 2: Run to see it fail**

  Run: `npx vitest run src/core/runState.test.ts`
  Expected: FAIL (`resolveStartAt` not exported; `elapsedMs` 0).

- [ ] **Step 3: Implement**

  In `src/core/runState.ts`, extend the constructor:

```ts
  constructor(emitter: Pick<RunEventEmitter, 'emit'>, timeScale = 1, startMs = 0) {
    this.emitter = emitter;
    this.timeScale = clampTimeScale(timeScale);
    // `?startAt=` (#127): a test hook that starts the clock late. Anything unusable is a fresh run.
    this.elapsed = Number.isFinite(startMs) && startMs > 0 ? startMs : 0;
  }
```

  Then add the resolver:

```ts
/**
 * `?startAt=<seconds>` starts the run clock late (#127): a 20-minute run is too
 * long for a Playwright check to climb, so the full run starts just short of
 * the boss. A test hook like `?timeScale=`; the build is still a fresh one.
 * Anything absent, unparseable, negative or not before the boss reads as 0.
 */
export function resolveStartAt(search: string): number {
  const raw = new URLSearchParams(search).get('startAt');
  if (raw === null || raw.trim() === '') return 0;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= BOSS_START_TIME) return 0;
  return seconds * 1000;
}
```

  Also:
  - `src/core/scenePayloads.ts`: add
    `/** `?startAt=` in ms (#127); read by Game. */ export const START_AT_REGISTRY_KEY = 'startAt';`.
  - `BootScene`, after the timeScale block:

```ts
    // `?startAt=<s>` starts the run clock late (#127) so e2e can reach the boss.
    const startAt = resolveStartAt(location.search);
    this.registry.set(START_AT_REGISTRY_KEY, startAt);
    if (startAt > 0) console.info(`[run] startAt=${startAt / 1000}`);
```

  - `GameScene:422` becomes
    `this.run = new RunState(this.events, this.timeScale(), this.startAt());`,
    with the helper:

```ts
  /** `?startAt=` is resolved once in Boot; a Game started without it starts at 0:00. */
  private startAt(): number {
    const ms: unknown = this.registry.get(START_AT_REGISTRY_KEY);
    return typeof ms === 'number' ? ms : 0;
  }
```

- [ ] **Step 4: Run**

  Run: `npx vitest run && npx tsc --noEmit`
  Expected: PASS.

### Task 4: e2e on the new clock, full QA

**Files:**
- Modify: `e2e/fullRun.spec.ts` (URL, doc comments, and the Result time assertion)

- [ ] **Step 1: Point `fullRun` at the boss**

  - Add `const START_AT_S = 1190;` with a doc comment: the run is 20 minutes
    (#127), so the check starts 10 s of run time before the boss.
  - The URL becomes
    `/?seed=1&timeScale=${TIME_SCALE}&invulnerable=1&startAt=${START_AT_S}`.
  - Keep `timeSurvivedMs >= BOSS_START_MS`. It still holds, because the clock
    starts at 1 190 000 ms.
  - Update the header comment: remove "Observed at seed 1: fire wins at about
    5:30…" and replace it with the new observation once measured (Step 3).

- [ ] **Step 2: Full QA from clean**

  Run: `npm ci && npm run lint && npm test && npm run build`
  Expected: all green.

  Then run e2e alone: `npm run test:e2e`.

- [ ] **Step 3: Measure the boss kill at the new HP**

  The boss now has 7200 HP against a level-1 build. Read the fire and earth
  `timeSurvivedMs` from the fullRun Results.
  - If either run misses the 90 s budget: raise `START_AT_S` earlier (e.g. 1080,
    two minutes of waves to level up) rather than weakening the boss. Re-run.
  - Record the observed win times in the header comment.

- [ ] **Step 4: Roster smokes**

  The early waves are slower than before: fast enemies now arrive at 2:00 and
  tanks at 4:00, where they used to arrive at 1:00 and 2:00. Any roster spec
  that counts density in the first minutes may fall short.
  - For each failure, re-run it once alone before diagnosing.
  - For a real miss, lengthen that spec's run-time window or add
    `startAt` to put it in a denser wave. Don't loosen the assertion.

- [ ] **Step 5: Review, then stop for approval**

  Run a senior code review of the working-tree diff against spec §2.3 and the
  #127 acceptance criteria. Present the QA results and the diff summary, then
  wait for PM approval before committing (CLAUDE.md). Commit message:
  `feat: make the run 20 minutes with the boss at the end (CO-105) (#127)`.
