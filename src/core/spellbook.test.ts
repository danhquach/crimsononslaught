import { describe, expect, it } from 'vitest';
import type { RosterSpellId } from '../config/loadout';
import { BASE_SPELL_STATS } from '../config/spells';
import { buildLoadout } from './loadout';
import { RunState } from './runState';
import { Spell } from './spell';
import { Spellbook, type BaseStatsFor, type SpellFactory } from './spellbook';
import type { SpellStatsBySpell } from './spellStats';

/**
 * CO-109: a run casts every equipped spell, each on its own cooldown, and one
 * passive moves all of their numbers at once.
 *
 * The spells are stubs — a `Spell` is pure TS and only counts time, so the whole
 * criterion is checked here rather than through Phaser.
 */

/** The ids this suite has an implementation for; the roster lands with #140-#143. */
type StubId = 'fire' | 'ice' | 'lightning';

const STUB_IDS: readonly StubId[] = ['fire', 'ice', 'lightning'];

function isStubId(spellId: RosterSpellId): spellId is StubId {
  return (STUB_IDS as readonly string[]).includes(spellId);
}

/** Counts its casts and the run-time second each one landed on. */
class StubSpell extends Spell<StubId> {
  casts = 0;
  readonly castTimes: number[] = [];
  private elapsed = 0;

  protected override tick(deltaS: number): void {
    this.elapsed += deltaS;
    super.tick(deltaS);
  }

  protected cast(): void {
    this.casts += 1;
    this.castTimes.push(this.elapsed);
  }
}

const FRAME_MS = 1000 / 60;

const factory: SpellFactory = (spellId, stats) =>
  isStubId(spellId) ? new StubSpell(spellId, stats as SpellStatsBySpell[StubId]) : undefined;

const baseStats: BaseStatsFor = (spellId) =>
  isStubId(spellId) ? BASE_SPELL_STATS[spellId] : undefined;

function book(create: SpellFactory = factory, base: BaseStatsFor = baseStats): Spellbook {
  return new Spellbook(buildLoadout('fire'), create, base);
}

/** Equip and hand back the stub, so a test can read what it cast. */
function equip(spells: Spellbook, spellId: StubId): StubSpell {
  const spell = spells.equip(spellId);
  if (!spell) throw new Error(`the rig failed to equip "${spellId}"`);
  return spell as StubSpell;
}

/**
 * Drive the book for `seconds` of *wall* time through a `RunState` at
 * `timeScale`, as `GameScene.update` does: the scene delta is scaled once by
 * the run clock and every spell is stepped over the window it returns.
 */
function runFor(spells: Spellbook, seconds: number, timeScale = 1): void {
  const run = new RunState({ emit: () => true }, timeScale);
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let i = 0; i < frames; i += 1) spells.update(run.tick(FRAME_MS).deltaMs);
}

describe('Spellbook (CO-109)', () => {
  it('starts with nothing equipped', () => {
    expect(book().spells).toEqual([]);
  });

  it('equips a spell at the block its base stats resolve to', () => {
    const spells = book();
    const fire = equip(spells, 'fire');
    expect(fire.id).toBe('fire');
    expect(fire.stats).toEqual(BASE_SPELL_STATS.fire);
    expect(spells.spells).toEqual([fire]);
  });

  it('refuses a spell it cannot build, and one with no stat block', () => {
    expect(book().equip('fire_meteor')).toBeUndefined();
    expect(book(() => undefined).equip('fire')).toBeUndefined();
    expect(book(factory, () => undefined).equip('fire')).toBeUndefined();
    expect(book(() => undefined).spells).toEqual([]);
  });

  it('refuses a second copy of a spell already equipped', () => {
    const spells = book();
    equip(spells, 'fire');
    expect(spells.equip('fire')).toBeUndefined();
    expect(spells.spells).toHaveLength(1);
  });

  it('casts three actives independently, each on its own cooldown', () => {
    const spells = book();
    const fire = equip(spells, 'fire');
    const ice = equip(spells, 'ice');
    const lightning = equip(spells, 'lightning');
    runFor(spells, 14);

    // 14 s at the base cooldowns: fire and lightning 1.0 s, ice 1.4 s.
    expect(fire.casts).toBe(14);
    expect(ice.casts).toBe(10);
    expect(lightning.casts).toBe(14);
    // Each cast on its own boundary, within the frame that crossed it.
    ice.castTimes.forEach((at, index) => {
      const boundary = (index + 1) * BASE_SPELL_STATS.ice.cooldown;
      expect(at - boundary).toBeGreaterThan(-1e-9);
      expect(at - boundary).toBeLessThan(FRAME_MS / 1000);
    });
  });

  it('scales every spell with the run clock, and holds them all when it stops', () => {
    const spells = book();
    const fire = equip(spells, 'fire');
    const ice = equip(spells, 'ice');
    // One second of wall clock at scale 10 is ten seconds of run time, for both.
    runFor(spells, 1, 10);
    expect(fire.casts).toBe(10);
    expect(ice.casts).toBe(7);

    // A paused Game stops calling `update` at all; nothing may creep forward.
    const held = [fire.casts, ice.casts];
    spells.update(0);
    expect([fire.casts, ice.casts]).toEqual(held);
  });

  it('starts a spell equipped mid-run on a full cooldown of its own', () => {
    const spells = book();
    const fire = equip(spells, 'fire');
    runFor(spells, 5);
    const lightning = equip(spells, 'lightning');
    runFor(spells, 3);

    expect(fire.casts).toBe(8);
    // Same cooldown, three seconds of life: no share of the charge fire built up.
    expect(lightning.casts).toBe(3);
    expect(lightning.castTimes[0]).toBeGreaterThan(1 - 1e-9);
  });

  it('pushes a passive onto every equipped spell at once', () => {
    const spells = book();
    for (const id of STUB_IDS) equip(spells, id);
    spells.takePassive('passive_power');

    for (const spell of spells.spells) {
      expect(spell.stats.damage).toBeCloseTo(BASE_SPELL_STATS[spell.id].damage * 1.1, 10);
    }
    expect(spells.profile.damageMul).toBeCloseTo(1.1, 10);
  });

  it('casts a shortened cooldown from the frame the passive lands', () => {
    const spells = book();
    const fire = equip(spells, 'fire');
    runFor(spells, 10);
    expect(fire.casts).toBe(10);

    // Haste is a 0.92 multiplier: ten more seconds now owe about 10.87 casts.
    spells.takePassive('passive_haste');
    expect(fire.stats.cooldown).toBeCloseTo(0.92, 10);
    runFor(spells, 10);
    expect(fire.casts).toBe(20);
  });

  it('gives a spell equipped after a passive the same block as one equipped before', () => {
    const early = book();
    const beforePassive = equip(early, 'fire');
    early.takePassive('passive_power');

    const late = book();
    late.takePassive('passive_power');
    const afterPassive = equip(late, 'fire');

    expect(afterPassive.stats).toEqual(beforePassive.stats);
  });

  it('leaves the stats of a run with no passives at the base block', () => {
    const spells = book();
    for (const id of STUB_IDS) equip(spells, id);
    for (const spell of spells.spells) {
      expect(spell.stats).toEqual(BASE_SPELL_STATS[spell.id]);
    }
  });

  it('re-resolves against the base block the caller supplies now', () => {
    let damage = BASE_SPELL_STATS.fire.damage;
    const spells = book(factory, (spellId) =>
      spellId === 'fire' ? { ...BASE_SPELL_STATS.fire, damage } : undefined,
    );
    const fire = equip(spells, 'fire');
    damage = 100;
    spells.refresh();
    expect(fire.stats.damage).toBe(100);
  });

  it('throws on a passive the loadout cannot take', () => {
    const spells = book();
    expect(() => spells.takePassive('passive_power_typo' as 'passive_power')).toThrow();
  });
});
