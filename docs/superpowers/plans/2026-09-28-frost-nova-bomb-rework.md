# Frost Nova Bomb Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Frost Nova Bomb (CO-182, #303) into a slow spinning ice urchin that rolls toward the densest group, sprays icicles in a turning spiral and bursts into its freezing ring inside the pack. It also gets new art.

**Architecture:** The rules are pure functions in `src/core/frostNova.ts`: aim, spiral angles, throw clock, burst trigger and icicle frost. They are Vitest-covered. `src/spells/NovaBombSpell.ts` owns two Arcade projectile pools. Bombs are not registered for collisions, so they pass through enemies. Icicles are registered, and each breaks on its first hit. Art is generated with Pollinations, cut into the atlas and wired through `STATIC_FRAMES` and the animation table.

**Tech Stack:** Vite + TypeScript + Phaser 3.88, Vitest (`src/core/**`, no Phaser imports), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md`. Read it first.

**Changed during execution (the spec is current; this plan is the record of how it was built):**
- The burst trigger arms after `BURST_ARM_DISTANCE` (120 px) and then counts enemies within the burst `radius`. `BURST_TRIGGER_RADIUS` (50) is gone: at the player's feet it burst every bomb on its first frame.
- `shouldBurst` takes `(at, enemies, travelled, range, radius)`, and `Projectile` gained `travelled`.
- The e2e group test runs the normal enemy mix, not `?enemies=swarm`. It asserts one group burst and at least one icicle hit per burst. The group share is measured with the kiting bot instead.
- Placeholder colours are `0x29b6f6` and `0xe1f5fe`: the plan's colours duplicated existing keys.
- The ring sheet is 3 × 2 at `sheetCell` 896 on atlas page 18, with `SPIKE_RING_SCALE_RADIUS` 61.

## Global Constraints

- Work only in the worktree `.claude/worktrees/issue-303-frost-nova-rework`, on branch `issue-303-frost-nova-rework`. Before and after every task, run `git branch --show-current` and check that it prints `issue-303-frost-nova-rework`.
- **Never commit, push, stash or check out another branch.** The project rule is that the PM approves before any commit. Leave all changes in the working tree.
- RNG only through `src/core/rng.ts`. No `Math.random`.
- `src/core/**` never imports Phaser.
- Match the surrounding code: JSDoc on every export in the house voice, ticket tags like `(CO-182)` in comments, 2-space indent, single quotes. Run `npx prettier --write <files>` on every file you touched.
- CPU cap: run Vitest with `--maxWorkers=2`. Run Playwright alone: no other Vitest, tsc or Playwright job may run while it does.
- Constants (not stats): `BOMB_SPIN_DEG_PER_S = 540`, `ICICLE_SPIRAL_STEP_DEG = 40`, `BURST_TRIGGER_COUNT = 3`, `BURST_TRIGGER_RADIUS = 50`, `MAX_LIVE_ICICLES = 32`.
- Base block: `cooldown 3.5, damage 24, radius 110, speed 80, range 240, slowPct 0.4, slowDuration 2, freezeChance 0.15, freezeDuration 1, throwInterval 0.25, icicles 2, icicleDamage 14, icicleSpeed 320, icicleRange 110`.
- Card description, verbatim: `Rolls a spinning ice bomb through the crowd. It sprays icicles, then bursts into a freezing ring.`
- No names of commercial games anywhere. The repo is public.

---

### Task 1: Pure bomb rules in `core/frostNova.ts`

**Files:**
- Modify: `src/core/frostNova.ts`
- Test: `src/core/frostNova.test.ts`

**Interfaces:**
- Consumes: `densestSpot(origin, candidates, radius, targetRange, rng): Vec2` from `src/core/groundArea.ts`; `nearestEnemies`, `anyWithin` from `src/core/spell.ts`.
- Produces (later tasks import these exact names):
  - `BOMB_SPIN_DEG_PER_S`, `ICICLE_SPIRAL_STEP_DEG`, `BURST_TRIGGER_COUNT`, `BURST_TRIGGER_RADIUS`, `MAX_LIVE_ICICLES` (numbers).
  - `bombAim<T extends Vec2>(caster: Readonly<Vec2>, enemies: readonly T[], radius: number, range: number, rng: Rng): Vec2 | undefined` returns a unit heading.
  - `throwAngles(aimRad: number, throwIndex: number, icicles: number): number[]` returns radians.
  - `throwsDue(elapsedS: number, thrown: number, throwInterval: number): number`.
  - `shouldBurst(at: Readonly<Vec2>, enemies: readonly Readonly<Vec2>[], rangeReached: boolean): boolean`.
  - `icicleFrost(stats: Readonly<{ slowPct: number; slowDuration: number }>): FrostHit`.
  - `bombTarget` stays for now. Task 3 deletes it.

- [ ] **Step 1: Write the failing tests.** Append to `src/core/frostNova.test.ts` and extend the import from `./frostNova` with the new names:

```ts
describe('bombAim (CO-182)', () => {
  const caster = { x: 0, y: 0 };
  const lone = { x: 40, y: 0 };
  const pack = [
    { x: 0, y: 150 },
    { x: 10, y: 150 },
    { x: -10, y: 150 },
    { x: 0, y: 160 },
  ];

  it('heads for the densest group, not the nearer lone enemy', () => {
    const aim = bombAim(caster, [lone, ...pack], 110, 240, createRng(1));
    expect(aim).toBeDefined();
    expect(aim?.y).toBeGreaterThan(0.9);
    expect(Math.hypot(aim?.x ?? 0, aim?.y ?? 0)).toBeCloseTo(1, 9);
  });

  it('aims at nothing with no enemy in range', () => {
    expect(bombAim(caster, [{ x: 500, y: 0 }], 110, 240, createRng(1))).toBeUndefined();
  });

  it('falls back to the nearest enemy when the densest spot is the caster itself', () => {
    const onTop = { x: 0, y: 0 };
    const aim = bombAim(caster, [onTop, lone], 110, 240, createRng(1));
    expect(aim).toEqual({ x: 1, y: 0 });
  });

  it('draws nothing from the RNG when one group is clearly densest', () => {
    const rng = createRng(7);
    const control = createRng(7);
    // Radius 12: (0,150) has all four inside, every other pack member two, so no tie.
    bombAim(caster, [lone, ...pack], 12, 240, rng);
    expect(rng.next()).toBe(control.next());
  });
});

describe('throwAngles (CO-182)', () => {
  it('throws two opposite icicles, a quarter turn off the aim, on the first throw', () => {
    const [a, b] = throwAngles(0, 0, 2);
    expect(a).toBeCloseTo(Math.PI / 2, 9);
    expect(b).toBeCloseTo(Math.PI / 2 + Math.PI, 9);
  });

  it('turns the whole set by the spiral step on every throw', () => {
    const step = (ICICLE_SPIRAL_STEP_DEG * Math.PI) / 180;
    expect(throwAngles(0, 3, 2)[0]).toBeCloseTo(Math.PI / 2 + 3 * step, 9);
  });

  it('spaces three icicles a third of a turn apart', () => {
    const [a, b, c] = throwAngles(1, 0, 3);
    expect((b ?? 0) - (a ?? 0)).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect((c ?? 0) - (b ?? 0)).toBeCloseTo((2 * Math.PI) / 3, 9);
  });

  it('throws nothing for a count of 0', () => {
    expect(throwAngles(0, 0, 0)).toEqual([]);
  });
});

describe('throwsDue (CO-182)', () => {
  it('owes the first throw one interval after the launch, not at it', () => {
    expect(throwsDue(0, 0, 0.25)).toBe(0);
    expect(throwsDue(0.24, 0, 0.25)).toBe(0);
    expect(throwsDue(0.25, 0, 0.25)).toBe(1);
  });

  it('owes every throw a long step skipped, minus those already thrown', () => {
    expect(throwsDue(1.0, 1, 0.25)).toBe(3);
  });

  it('owes nothing on a non-positive interval', () => {
    expect(throwsDue(5, 0, 0)).toBe(0);
  });

  it('makes 11 throws over the 3 s base flight, the last step bursting first', () => {
    const flightS = BASE_NOVA_BOMB_STATS.range / BASE_NOVA_BOMB_STATS.speed;
    // The step that reaches range bursts and throws nothing, so the 12th is never owed.
    expect(throwsDue(flightS - 1e-9, 0, BASE_NOVA_BOMB_STATS.throwInterval)).toBe(11);
  });
});

describe('shouldBurst (CO-182)', () => {
  const at = { x: 0, y: 0 };
  const near = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 5, y: 0 }));

  it('holds with fewer than the trigger count inside the trigger radius', () => {
    expect(shouldBurst(at, near(BURST_TRIGGER_COUNT - 1), false)).toBe(false);
  });

  it('bursts once the trigger count stands inside the trigger radius, inclusive', () => {
    const pack = [...near(BURST_TRIGGER_COUNT - 1), { x: BURST_TRIGGER_RADIUS, y: 0 }];
    expect(shouldBurst(at, pack, false)).toBe(true);
  });

  it('ignores enemies just outside the trigger radius', () => {
    const far = Array.from({ length: 5 }, () => ({ x: BURST_TRIGGER_RADIUS + 1, y: 0 }));
    expect(shouldBurst(at, far, false)).toBe(false);
  });

  it('bursts at the end of its range with nobody near', () => {
    expect(shouldBurst(at, [], true)).toBe(true);
  });
});

describe('icicleFrost (CO-182)', () => {
  it('carries the bomb slow and never freezes', () => {
    expect(icicleFrost(base)).toEqual({
      slowPct: base.slowPct,
      slowDuration: base.slowDuration,
      freeze: false,
    });
  });
});
```

- [ ] **Step 2: Run them and check that they fail.**
  - Run: `npx vitest run src/core/frostNova.test.ts --maxWorkers=2`
  - Expected: FAIL. The new names are not exported, and `throwInterval` is not on the base block yet. The `throwsDue` 11-throws case keeps failing until Task 2, which is expected.

- [ ] **Step 3: Implement.** In `src/core/frostNova.ts`, add `import { densestSpot } from './groundArea';`, change the spell import to `import { anyWithin, nearestEnemies } from './spell';`, update the module JSDoc to mention CO-182's roll-and-spray rules, and add:

```ts
/** The bomb sprite's turn rate, in degrees per second (CO-182). The look only: no rule reads it. */
export const BOMB_SPIN_DEG_PER_S = 540;

/** How far the icicle set turns from one throw to the next, in degrees (CO-182): the spiral. */
export const ICICLE_SPIRAL_STEP_DEG = 40;

/** Live enemies within `BURST_TRIGGER_RADIUS` of a rolling bomb that set it off (CO-182). */
export const BURST_TRIGGER_COUNT = 3;

/** How close, in px, `BURST_TRIGGER_COUNT` enemies must stand to the bomb to set it off (CO-182). */
export const BURST_TRIGGER_RADIUS = 50;

/**
 * Icicles in the air the pool may ever hold (CO-182). An icicle lives about
 * 0.34 s (110 px at 320 px/s) and a bomb throws 2 every 0.25 s, so one bomb
 * keeps about 3 up; the cap leaves room for a hasted, long-range build with
 * several bombs rolling at once.
 */
export const MAX_LIVE_ICICLES = 32;

/**
 * Where a throw heads (CO-182): toward the densest group within `range`, the
 * spot Ice Storm would drop on (`densestSpot`), as a unit vector. With nobody
 * in range, `undefined` — the cast waits (#212). Should the densest spot be
 * the caster itself (an enemy standing on the player), the nearest enemy
 * decides instead, and one standing exactly on the player sends it right.
 */
export function bombAim<T extends Vec2>(
  caster: Readonly<Vec2>,
  enemies: readonly T[],
  radius: number,
  range: number,
  rng: Rng,
): Vec2 | undefined {
  if (!anyWithin(caster, enemies, range)) return undefined;
  const spot = densestSpot(caster, enemies, radius, range, rng);
  let dx = spot.x - caster.x;
  let dy = spot.y - caster.y;
  if (dx === 0 && dy === 0) {
    const nearest = nearestEnemies(caster, enemies, 2, range).find(
      (enemy) => enemy.x !== caster.x || enemy.y !== caster.y,
    );
    if (!nearest) return { x: 1, y: 0 };
    dx = nearest.x - caster.x;
    dy = nearest.y - caster.y;
  }
  const length = Math.hypot(dx, dy);
  return { x: dx / length, y: dy / length };
}

/**
 * The headings, in radians, of throw number `throwIndex` (0 = the first)
 * (CO-182): `icicles` spaced evenly round the circle, the set starting a
 * quarter turn off the aim and turning `ICICLE_SPIRAL_STEP_DEG` per throw, so
 * the spray spirals out as the bomb rolls.
 */
export function throwAngles(aimRad: number, throwIndex: number, icicles: number): number[] {
  const count = Math.floor(icicles);
  if (!(count > 0)) return [];
  const start = aimRad + Math.PI / 2 + (throwIndex * ICICLE_SPIRAL_STEP_DEG * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => start + (i * 2 * Math.PI) / count);
}

/**
 * Throws owed now (CO-182): one every `throwInterval` s after the launch, the
 * first a full interval in, less the `thrown` already made. A long step owes
 * every throw it covered, so a scaled run sprays as many icicles as a real one.
 */
export function throwsDue(elapsedS: number, thrown: number, throwInterval: number): number {
  if (!(throwInterval > 0) || !(elapsedS > 0)) return 0;
  return Math.max(0, Math.floor(elapsedS / throwInterval) - thrown);
}

/**
 * Whether a rolling bomb goes off now (CO-182): `BURST_TRIGGER_COUNT` enemies
 * within `BURST_TRIGGER_RADIUS` of it (the radius counting as in), so a lone
 * runner cannot set it off, or its range has run out.
 */
export function shouldBurst(
  at: Readonly<Vec2>,
  enemies: readonly Readonly<Vec2>[],
  rangeReached: boolean,
): boolean {
  if (rangeReached) return true;
  const radiusSq = BURST_TRIGGER_RADIUS * BURST_TRIGGER_RADIUS;
  let near = 0;
  for (const enemy of enemies) {
    const dx = enemy.x - at.x;
    const dy = enemy.y - at.y;
    if (dx * dx + dy * dy <= radiusSq) near += 1;
    if (near >= BURST_TRIGGER_COUNT) return true;
  }
  return false;
}

/** What one icicle leaves on the enemy it breaks on (CO-182): the bomb's slow, never a freeze. */
export function icicleFrost(stats: Readonly<{ slowPct: number; slowDuration: number }>): FrostHit {
  return { slowPct: stats.slowPct, slowDuration: stats.slowDuration, freeze: false };
}
```

- [ ] **Step 4: Run the tests.**
  - Run: `npx vitest run src/core/frostNova.test.ts --maxWorkers=2`
  - Expected: everything passes except `makes 11 throws over the 3 s base flight`, which needs Task 2's block. Tasks 1 and 2 are dispatched together, so that case goes green at the end of Task 2.

- [ ] **Step 5: Don't commit.** Report the diff summary.

---

### Task 2: Stat block, field categories and card

**Files:**
- Modify: `src/core/spellStats.ts:50-73` (the `NovaBombStats` interface)
- Modify: `src/config/iceRoster.ts`
- Modify: `src/config/spellFields.ts`
- Test: `src/config/iceRoster.test.ts`, `src/core/playerProfile.test.ts`, `src/core/frostNova.test.ts` (`MAX_LIVE_BOMBS` and a new `MAX_LIVE_ICICLES` block)

**Interfaces:**
- Produces: `NovaBombStats` gains `throwInterval`, `icicles`, `icicleDamage`, `icicleSpeed` and `icicleRange` (all `number`). `BASE_NOVA_BOMB_STATS` holds the Global Constraints block.

- [ ] **Step 1: Write the failing tests.**
  - In `src/config/iceRoster.test.ts`, replace the `toEqual` block in `carries the spec §9.3 numbers` with the Global Constraints block. Rename the test `carries the CO-182 rework numbers for Frost Nova Bomb`.
  - Add, in `ice roster presentation`:

```ts
  it('says what the reworked bomb does, with its own numbers (CO-182)', () => {
    const card = ICE_ROSTER_CARDS.ice_nova_bomb;
    expect(card.description).toBe(
      'Rolls a spinning ice bomb through the crowd. It sprays icicles, then bursts into a freezing ring.',
    );
    expect(card.stats).toEqual([
      ['Cooldown', '3.5 s'],
      ['Icicles', '14 each'],
      ['Burst', '24 in 110'],
      ['Slow', '40% for 2 s'],
      ['Freeze', '15% for 1 s'],
    ]);
  });
```

  - In `src/core/playerProfile.test.ts`, add after the Meteor `describe`, importing `BASE_NOVA_BOMB_STATS` from `../config/iceRoster`:

```ts
  // CO-182 rework spec §4: each passive reaches exactly the Frost Nova Bomb fields it names.
  describe('Frost Nova Bomb (CO-182)', () => {
    const at = (id: string, rank: number) =>
      resolveSpellStats(BASE_NOVA_BOMB_STATS, resolveProfile(ranks([[id, rank]])));

    it('throws faster with Haste', () => {
      const out = at('passive_haste', 5);
      expect(out.throwInterval).toBeCloseTo(0.25 * 0.92 ** 5, 9);
      expect(out.cooldown).toBeCloseTo(3.5 * 0.92 ** 5, 9);
    });

    it('hits harder with Power, icicles and burst alike', () => {
      const out = at('passive_power', 3);
      expect(out.icicleDamage).toBeCloseTo(14 * 1.1 ** 3, 9);
      expect(out.damage).toBeCloseTo(24 * 1.1 ** 3, 9);
    });

    it('reaches further with Expanse', () => {
      const out = at('passive_expanse', 3);
      expect(out.icicleRange).toBeCloseTo(110 * 1.12 ** 3, 9);
      expect(out.range).toBeCloseTo(240 * 1.12 ** 3, 9);
    });

    it('never changes the icicle count', () => {
      for (const id of ['passive_power', 'passive_haste', 'passive_expanse', 'passive_velocity']) {
        expect(at(id, 5).icicles, id).toBe(BASE_NOVA_BOMB_STATS.icicles);
      }
    });
  });
```

  - Check the real passive ids in `src/config/passives.ts` first, and the `ranks`/`resolveProfile` helpers already at the top of that test file. Use `passive_velocity` only if it's the id of the passive named "Velocity". Otherwise use the real id.
  - Add a Velocity case for `icicleSpeed` too, using the multiplier that passive actually applies (read `src/core/playerProfile.ts`).
  - In `src/core/frostNova.test.ts`, add below the `MAX_LIVE_BOMBS` block:

```ts
describe('MAX_LIVE_ICICLES (CO-182)', () => {
  it('holds every icicle a hasted, long-range build can have in the air', () => {
    const cooldown = base.cooldown * 0.5;
    const interval = base.throwInterval * 0.5;
    const bombs = Math.ceil((base.range * 1.5) / base.speed / cooldown);
    const lifeS = (base.icicleRange * 1.5) / base.icicleSpeed;
    const perBomb = Math.ceil(lifeS / interval) * base.icicles;
    expect(MAX_LIVE_ICICLES).toBeGreaterThanOrEqual(bombs * perBomb);
  });
});
```

  - If that bound comes out above 32, raise `MAX_LIVE_ICICLES` to the smallest multiple of 8 that holds it. Update its JSDoc arithmetic and the Global Constraints value in this plan.

- [ ] **Step 2: Run the tests and check that they fail.**
  - Run: `npx vitest run src/config/iceRoster.test.ts src/core/playerProfile.test.ts src/core/frostNova.test.ts --maxWorkers=2`
  - Expected: FAIL (old numbers, missing fields).

- [ ] **Step 3: Implement.**
  - `src/core/spellStats.ts`: rewrite the `NovaBombStats` JSDoc for the rework ("rolls toward the densest group within `range`, spraying icicles, and bursts in the pack or at range, CO-182"). Add, each with a one-line doc: `throwInterval` (seconds between icicle throws), `icicles` (icicles per throw, spaced evenly round the circle), `icicleDamage` (damage one icicle deals to the enemy it breaks on), `icicleSpeed` (icicle speed in px/s), `icicleRange` (how far an icicle flies before it expires, in px). Update the docs on `speed` ("rolling speed") and `range` ("how far it rolls before bursting on its own; also the aiming range"), and on `damage` ("the burst's damage").
  - `src/config/iceRoster.ts`: set `BASE_NOVA_BOMB_STATS` to the Global Constraints block. The JSDoc says it is the CO-182 rework block (`docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md` §4), not the §9.3 table. Set the card to the description above and the five stat rows in the test. Update the module JSDoc's "Phase 1's Frost Nova thrown" sentence to the rolling-urchin description.
  - `src/config/spellFields.ts`: add `throwInterval: 'cooldown'` to the cooldown group, `icicleDamage: 'damage'` to damage, `icicleRange: 'area'` to area, `icicleSpeed: 'speed'` to speed, and `icicles: 'unscaled'` to unscaled.
  - `resolveSpellStats applies each category multiplier…` iterates every field, so it covers them automatically.

- [ ] **Step 4: Run the tests.**
  - Run: `npx vitest run src/config src/core --maxWorkers=2`
  - Expected: PASS, including Task 1's 11-throws case.
  - If another suite pins the old nova numbers (for example `hudModel.test.ts`), update it to the new block. Do not weaken it.

- [ ] **Step 5: Don't commit.**

---

### Task 3: `NovaBombSpell` rolls, spins, sprays and bursts in the pack

**Files:**
- Modify: `src/spells/NovaBombSpell.ts` (a full rework of the class body)
- Modify: `src/config/colors.ts` (two placeholder texture keys) and `src/config/colors.test.ts` (key lists)
- Modify: `src/scenes/GameScene.ts:732-744` (the `iceReport` test hook)
- Modify: `src/core/frostNova.ts` and `src/core/frostNova.test.ts` (delete `bombTarget` and its `describe`)
- Modify: `e2e/iceRoster.spec.ts`

**Interfaces:**
- Consumes: everything Task 1 produces, and Task 2's `NovaBombStats`.
- Produces: `NovaBombSpell` getters `hits` (enemies the bursts caught), `detonations`, `icicleHits`, `burstCaught: readonly number[]` (how many each burst caught, in order), `bombRotation: number | null` (the first live bomb's rotation) and `liveCount` (bombs plus icicles in the air). Also `iceReport` entries `{ id, hits, live, icicleHits?, burstCaught?, bombRotation? }`.

- [ ] **Step 1: Placeholders.**
  - In `src/config/colors.ts`, add `'proj_nova_bomb'` and `'proj_icicle'` to `TEXTURE_KEYS`, after `'proj_ice'`. Add to `PLACEHOLDERS`:

```ts
  // CO-182: Frost Nova Bomb's rolling urchin and the icicles it throws. A disc
  // and a thin diamond in the ice blue, so without the atlas the bomb still
  // reads apart from Ice Arrow's `proj_ice`; with it they wear `ice.urchin`
  // and `ice.icicle`.
  proj_nova_bomb: { shape: 'circle', color: 0x80d8ff, width: 22, height: 22 },
  proj_icicle: { shape: 'diamond', color: 0xb3e5fc, width: 14, height: 6 },
```

  - Add both keys wherever `src/config/colors.test.ts` lists the texture keys, and add them to `PLAYER_SHOTS` in the enemy-shot hue test.
  - Run `npx vitest run src/config --maxWorkers=2` and fix any other list that enumerates every key (grep `'proj_spike'` across `src` and `e2e` to find them).

- [ ] **Step 2: Rewrite `src/spells/NovaBombSpell.ts`.**
  - Keep the constructor signature: GameScene builds it unchanged.
  - Update the class JSDoc to the CO-182 behaviour and name the spec file.
  - The body:

```ts
const BOMB_LOOK: ProjectileLook = { texture: 'proj_nova_bomb' };
const ICICLE_LOOK: ProjectileLook = { texture: 'proj_icicle' };
const SPIN_RAD_PER_S = (BOMB_SPIN_DEG_PER_S * Math.PI) / 180;

/** One rolling bomb's own clock, and the numbers it was thrown with (spec §6.2 snapshot). */
interface Flight {
  readonly aimRad: number;
  readonly stats: Readonly<NovaBombStats>;
  elapsedS: number;
  thrown: number;
}

export class NovaBombSpell extends Spell<'ice_nova_bomb'> {
  private readonly bombs: Phaser.Physics.Arcade.Group;
  private readonly icicles: Phaser.Physics.Arcade.Group;
  private readonly flights = new Map<Projectile, Flight>();
  private readonly caster: Readonly<Vec2>;
  private readonly enemies: EnemyPool;
  private readonly damage: DamageSink;
  private readonly rng: Rng;
  private readonly fx: FxPool;
  private landed = 0;
  private burst = 0;
  private icicleLanded = 0;
  private readonly caught: number[] = [];

  constructor(/* unchanged parameter list */) {
    super('ice_nova_bomb', stats);
    // ...assign fields as today...
    // Bombs never touch an enemy: not registered with CollisionSystem, so
    // they roll through the crowd and burst only on the rule (CO-182).
    this.bombs = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_BOMBS,
      runChildUpdate: false,
    });
    this.icicles = scene.physics.add.group({
      classType: Projectile,
      maxSize: MAX_LIVE_ICICLES,
      runChildUpdate: false,
    });
    collisions.addSpellGroup(this.icicles, (enemy, hitbox) => this.onIcicleHit(enemy, hitbox));
  }

  get liveCount(): number {
    return this.bombs.countActive(true) + this.icicles.countActive(true);
  }
  get hits(): number {
    return this.landed;
  }
  get detonations(): number {
    return this.burst;
  }
  get icicleHits(): number {
    return this.icicleLanded;
  }
  get burstCaught(): readonly number[] {
    return this.caught;
  }
  get bombRotation(): number | null {
    for (const bomb of this.flights.keys()) if (bomb.active) return bomb.rotation;
    return null;
  }

  protected override tick(deltaS: number): void {
    super.tick(deltaS);
    const live = this.enemies.live;
    for (const [bomb, flight] of this.flights) {
      if (!bomb.active) {
        this.flights.delete(bomb);
        continue;
      }
      flight.elapsedS += deltaS;
      bomb.setRotation(bomb.rotation + SPIN_RAD_PER_S * deltaS);
      // Burst first: the step that bursts throws nothing (spec §3).
      if (shouldBurst(bomb, live, bomb.spent)) {
        this.detonate(bomb, flight.stats);
        continue;
      }
      const owed = throwsDue(flight.elapsedS, flight.thrown, flight.stats.throwInterval);
      for (let i = 0; i < owed; i += 1) this.throwIcicles(bomb, flight);
    }
    for (const child of this.icicles.getChildren()) {
      if (child instanceof Projectile && child.active && child.spent) child.despawn();
    }
  }

  protected override hasTarget(): boolean {
    return anyWithin(this.caster, this.enemies.live, this.stats.range);
  }

  protected cast(): void {
    const stats = { ...this.stats };
    const aim = bombAim(this.caster, this.enemies.live, stats.radius, stats.range, this.rng);
    if (!aim) return;
    const { x, y } = this.caster;
    const bomb = this.bombs.get(x, y) as Projectile | null;
    if (!bomb) return;
    const to = { x: x + aim.x * stats.range, y: y + aim.y * stats.range };
    bomb.fire(x, y, to, stats.speed, stats.range, BOMB_LOOK);
    this.flights.set(bomb, { aimRad: Math.atan2(aim.y, aim.x), stats, elapsedS: 0, thrown: 0 });
  }

  private throwIcicles(bomb: Projectile, flight: Flight): void {
    const { icicles, icicleSpeed, icicleRange } = flight.stats;
    for (const angle of throwAngles(flight.aimRad, flight.thrown, icicles)) {
      const icicle = this.icicles.get(bomb.x, bomb.y) as Projectile | null;
      // Pool exhausted: the rest of the throw is dropped, never queued.
      if (!icicle) break;
      const to = {
        x: bomb.x + Math.cos(angle) * icicleRange,
        y: bomb.y + Math.sin(angle) * icicleRange,
      };
      icicle.fire(bomb.x, bomb.y, to, icicleSpeed, icicleRange, ICICLE_LOOK);
    }
    flight.thrown += 1;
  }

  private onIcicleHit(enemy: Enemy, hitbox: SpellHitbox): void {
    if (!(hitbox instanceof Projectile) || !hitbox.active || !enemy.active) return;
    const from = { x: hitbox.x, y: hitbox.y };
    hitbox.despawn();
    this.icicleLanded += 1;
    this.fx.burst('ice.shatter', enemy.x, enemy.y);
    // Chill first, then damage, the way every Ice hit lands.
    enemy.applyFrost(icicleFrost(this.stats));
    this.damage(enemy, this.stats.icicleDamage, 'hit', from);
  }

  private detonate(bomb: Projectile, stats: Readonly<NovaBombStats>): void {
    const origin = { x: bomb.x, y: bomb.y };
    bomb.despawn();
    this.flights.delete(bomb);
    this.burst += 1;
    let caught = 0;
    for (const enemy of pulseTargets(origin, this.enemies.live, stats.radius)) {
      if (!enemy.active) continue;
      caught += 1;
      enemy.applyFrost(bombFrost(stats, this.rng));
      this.damage(enemy, stats.damage, 'hit', origin);
    }
    this.landed += caught;
    this.caught.push(caught);
    this.fx.burst('ice.nova', origin.x, origin.y, { scale: novaScale(stats.radius) });
  }
}
```

- Deleting from a `Map` while iterating it with `for…of` is safe in JS: the entry just stops being visited.
- `onIcicleHit` reads the live `this.stats` for its damage and frost. A rolling bomb's snapshot covers the burst and the throws, and an icicle in flight takes the live block, the way Ice Arrow does. This is a deliberate simplification: say so in a comment.
- Keep the existing imports that are still used, and remove unused ones.
- `burstCaught` grows by one entry per burst. That's fine for a test hook: at a 3.5 s cooldown that's about 350 numbers in a 20-minute run.

- [ ] **Step 3: Delete `bombTarget`.** Remove it from `src/core/frostNova.ts` and its `describe('bombTarget (#141)')` from the test file. Then run `grep -rn bombTarget src e2e`. Expected: no output.

- [ ] **Step 4: Test hook.** In `src/scenes/GameScene.ts`, change `iceReport` so it keeps the same filter and maps:

```ts
      .map((spell) =>
        spell instanceof NovaBombSpell
          ? {
              id: spell.id,
              hits: spell.hits,
              live: spell.liveCount,
              icicleHits: spell.icicleHits,
              burstCaught: [...spell.burstCaught],
              bombRotation: spell.bombRotation,
            }
          : { id: spell.id, hits: spell.hits, live: spell.liveCount },
      );
```

  - Widen the getter's return type to `{ id: RosterSpellId; hits: number; live: number; icicleHits?: number; burstCaught?: number[]; bombRotation?: number | null }[]`.
  - Update its JSDoc, adding a CO-182 line on the new fields.

- [ ] **Step 5: e2e.**
  - In `e2e/iceRoster.spec.ts`, change `CAPS.ice_nova_bomb` to `MAX_LIVE_BOMBS + MAX_LIVE_ICICLES` (import it) and update the header comment.
  - Add a second test in the same file. Use `startAt=` to begin in a dense stretch: read `START_AT_S` in `e2e/elites.spec.ts` for how it is passed, and choose 300 s unless `runState.ts` caps it lower.

```ts
/**
 * CO-182: the reworked bomb in a thick crowd — it spins as it rolls, its
 * icicles land, and most bursts go off inside a group. Only swarm enemies, so
 * the crowd is dense and the counts are about the bomb, not an elite's HP.
 */
test('Frost Nova Bomb rolls spinning, lands icicles, and bursts on groups', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(
    `/?seed=1&timeScale=10&invulnerable=1&startAt=300&enemies=swarm&loadout=ice_nova_bomb`,
  );
  await startFromIntro(page);
  await waitForScene(page, SCENE.spellSelect);
  const { x, y } = cardCenter(SPELL_IDS.indexOf(PICKED));
  await page.mouse.click(x, y);
  await waitForScene(page, SCENE.game);

  const rotations = new Set<number>();
  let bomb: Report[number] | undefined;
  const until = Date.now() + WALL_CAP_MS;
  let runMs = 0;
  while (runMs < 60_000 && Date.now() < until) {
    await answerLevelUp(page);
    const current = await sample(page);
    if (!current) break;
    bomb = current.find((entry) => entry.id === 'ice_nova_bomb');
    if (bomb?.bombRotation != null) rotations.add(Math.round(bomb.bombRotation * 100));
    runMs = (await readHud(page)).elapsedMs;
    await page.waitForTimeout(SAMPLE_MS);
  }

  const caught = bomb?.burstCaught ?? [];
  const onGroups = caught.filter((n) => n >= 3).length;
  // Logged before the asserts, so a CI failure shows the spread it failed on.
  console.log(
    `CO-182 bursts=${caught.length} onGroups=${onGroups} icicleHits=${bomb?.icicleHits} ` +
      `rotations=${rotations.size} caught=[${caught.join(',')}]`,
  );
  expect(rotations.size, 'distinct bomb rotations sampled').toBeGreaterThan(1);
  expect(bomb?.icicleHits, 'icicle hits over the window').toBeGreaterThan(0);
  expect(caught.length, 'bursts over the window').toBeGreaterThan(0);
  expect(onGroups * 2, `bursts on >=3 enemies, of ${caught.length}`).toBeGreaterThanOrEqual(
    caught.length,
  );
  expect(errors).toEqual([]);
});
```

  - Check the existing `sample()` reads `iceReport` in one `evaluate`, which it does, and leave it that way.

- [ ] **Step 6: Run everything once, one step at a time.**
  - Run: `npm run lint`. Expected: clean.
  - Run: `npx vitest run --maxWorkers=2`. Expected: PASS.
  - Run, with nothing else running: `npx playwright test e2e/iceRoster.spec.ts`. Expected: PASS.
  - Paste the `CO-182 bursts=…` log line into your report.
  - If the group assert fails, report the log line and stop. Don't change the trigger constants or the assert: the controller decides.
  - Run 2 more times and report all 3 log lines.

- [ ] **Step 7: Don't commit.** Report the results of Steps 6.1–6.3, and the branch check.

---

### Task 4: Art: generate, clean and cut (controller does this inline, not a subagent)

**Files:**
- Create: `docs/art/prompts/CO-182-frost-nova-bomb.md` (one self-contained `text` block per sheet, in the `CO-144-ice-storm.md` format, with "Delivered as:" notes filled in after the cut)
- Create: `docs/art/sheets/CO-182/ice_urchin.png`, `docs/art/sheets/CO-182/ice_spike_ring.png`
- Modify: `docs/art/sheets/CO-154/icons_ice.png` (splice cell 2 only)
- Modify: `docs/art/sheets/manifest.json`, then regenerate `src/config/frames.ts` and `public/assets/atlas/*` with `npm run art:cut`
- Test: add `scripts/lib/frostNovaBombArt.test.mjs` on the `iceStormArt.test.mjs` pattern: each clip's frame count and native size, the icicle lying along the anchor row, and the ring rim fraction.

Steps:
- [ ] Generate each sheet: Pollinations `openai/gpt-image-2`, `quality: medium`, the concept A image as reference, house rules from `docs/art/prompts/_shared.md`.
- [ ] Snap the magenta fringe.
- [ ] Centre each cell.
- [ ] Probe with the cutter's per-cell functions.
- [ ] Save as PNG.
- [ ] Strip the C2PA chunk.
- [ ] Add the manifest rows (`ice.urchin` and `ice.icicle` centred single frames; `ice.spikeRing` 6 frames centred).
- [ ] Run `npm run art:cut`. Then compare palette error against the pre-quantise atlas for the touched pages.
- [ ] Splice the urchin icon into `icons_ice.png` cell 2 from a jpeg-js decode. Check that the other cells stay byte-identical.

---

### Task 5: Wire the art

**Files:**
- Modify: `src/config/animations.ts` (add `spec('ice.spikeRing', 6, 15, ONCE)` next to `ice.nova`; add `proj_nova_bomb: 'ice.urchin.0'` and `proj_icicle: 'ice.icicle.0'` to `STATIC_FRAMES`)
- Modify: `src/config/fx.ts` + `src/core/fx.ts` (`SPIKE_RING_SCALE_RADIUS`, the native rim radius measured in Task 4; `spikeRingScale(radius)`)
- Modify: `src/spells/NovaBombSpell.ts` (the burst plays `ice.spikeRing` at `spikeRingScale(stats.radius)`; Ice Shield keeps `ice.nova`)
- Test: `src/config/animations.test.ts`, `src/core/fx.test.ts` (`spikeRingScale(SPIKE_RING_SCALE_RADIUS) === 1`, linear)

Steps:
- [ ] Write the failing tests.
- [ ] Implement.
- [ ] Run `npx vitest run --maxWorkers=2` and `npm run lint`.
- [ ] Take headless in-game screenshots of the roll with the spray and of the burst, over the dark floor at game scale (a scratch Playwright script in the scratchpad, not the pane). Zoom in and check the bomb and icicles read against the floor.

---

### Task 6: Docs, balance, gates (controller)

- [ ] In `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9.3, update the Frost Nova Bomb row's behaviour, the `ice_nova_bomb` column (the new block) and add a pointer to the rework spec. Rebase onto main after #304 merges first: #304 edits the same section.
- [ ] Run the balance sweep: the 20-minute bot sweep per `docs/tuning/phase2-balance.md`, Ice Storm alone vs Ice Storm + Frost Nova Bomb, 40 pooled runs each, loadouts logged, on a main that already has #304. Record the round in `docs/tuning/phase2-balance.md`. Retune `cooldown`, `icicleDamage` or `throwInterval` if needed, and sync spec §4, the card and the tests.
- [ ] Run the full gate from a clean install: `npm ci && npm run lint && npm test && npm run build`, then `npm run test:e2e` alone.
- [ ] Run a senior code review of the working-tree diff.
- [ ] No injection audit: the change adds no untrusted input (spec §7).
- [ ] Stop for PM approval before commit.
