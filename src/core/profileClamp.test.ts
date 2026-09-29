import { describe, expect, it } from 'vitest';
import { BASE_PLAYER_PROFILE, PASSIVES, type PlayerProfile } from '../config/passives';
import { RELIC_BUFFS, type RelicBuff } from '../config/relics';
import { atCap } from './profileClamp';

describe('atCap', () => {
  const at = (over: Partial<PlayerProfile>): PlayerProfile => ({ ...BASE_PLAYER_PROFILE, ...over });

  it('reads the clamp in the direction the buff moves its field', () => {
    const hourglass = RELIC_BUFFS.find((b) => b.id === 'relic_hourglass') as RelicBuff;
    const windstep = RELIC_BUFFS.find((b) => b.id === 'relic_windstep') as RelicBuff;
    expect(atCap(hourglass, at({ cooldownMul: 0.35 }))).toBe(true);
    expect(atCap(hourglass, at({ cooldownMul: 0.36 }))).toBe(false);
    expect(atCap(windstep, at({ moveSpeed: 320 }))).toBe(true);
    expect(atCap(windstep, at({ moveSpeed: 319 }))).toBe(false);
  });

  it('never caps a field with no clamp', () => {
    const fury = RELIC_BUFFS.find((b) => b.id === 'relic_ancient_fury') as RelicBuff;
    expect(atCap(fury, at({ damageMul: 1e6 }))).toBe(false);
  });

  it('reads a passive the same way (#315)', () => {
    const haste = PASSIVES.find((p) => p.id === 'passive_haste');
    if (!haste) throw new Error('no Haste');
    expect(atCap(haste, at({ cooldownMul: 0.35 }))).toBe(true);
    expect(atCap(haste, at({ cooldownMul: 0.36 }))).toBe(false);
  });
});
