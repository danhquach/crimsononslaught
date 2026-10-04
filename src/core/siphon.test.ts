import { describe, expect, it } from 'vitest';
import { SIPHON, type PlayerProfile } from '../config/passives';
import { resolveProfile } from './playerProfile';
import { createRng } from './rng';
import { SIM_STEP_MS } from './runState';
import {
  NEW_SIPHON,
  accrueSiphon,
  drainSiphon,
  resetSiphon,
  type SiphonConfig,
  type SiphonState,
} from './siphon';

const CFG: SiphonConfig = SIPHON;

const shareAt = (rank: number): number =>
  (resolveProfile(new Map([['passive_siphon', rank]])) as PlayerProfile).siphonShare;

describe('siphon — accrue and drain', () => {
  it('banks a share of landed damage and pays it out no faster than the ceiling', () => {
    const banked = accrueSiphon(NEW_SIPHON, 100, 0.01, CFG);
    expect(banked.pending).toBe(1);
    const out = drainSiphon(banked, 0.1, 100, CFG);
    expect(out.heal).toBeCloseTo(0.3, 12);
    expect(out.state.pending).toBeCloseTo(0.7, 12);
  });

  it('holds at most bankS seconds of the ceiling', () => {
    const banked = accrueSiphon(NEW_SIPHON, 1e9, 0.02, CFG);
    expect(banked.pending).toBe(CFG.maxHealPerS * CFG.bankS);
    expect(accrueSiphon(banked, 1e9, 0.02, CFG).pending).toBe(banked.pending);
  });

  it('ignores damage and shares that are not positive finite numbers', () => {
    for (const bad of [Number.NaN, -5, 0, Infinity, -Infinity]) {
      expect(accrueSiphon(NEW_SIPHON, bad, 0.02, CFG)).toEqual(NEW_SIPHON);
      expect(accrueSiphon(NEW_SIPHON, 50, bad, CFG)).toEqual(NEW_SIPHON);
    }
  });

  it('heals nothing and cues nothing with no room, and does not bank the unused heal', () => {
    let state: SiphonState = accrueSiphon(NEW_SIPHON, 1e6, 0.02, CFG);
    for (let i = 0; i < 100; i++) {
      const out = drainSiphon(state, 0.02, 0, CFG);
      expect(out.heal).toBe(0);
      expect(out.cue).toBe(false);
      state = out.state;
    }
    expect(state.pending).toBe(0);
    expect(drainSiphon(state, 0.02, 50, CFG).heal).toBe(0);
  });

  it('survives a bad delta or room', () => {
    const banked = accrueSiphon(NEW_SIPHON, 100, 0.02, CFG);
    expect(drainSiphon(banked, Number.NaN, 10, CFG).heal).toBe(0);
    expect(drainSiphon(banked, -1, 10, CFG).heal).toBe(0);
    expect(drainSiphon(banked, 0.02, Number.NaN, CFG).heal).toBe(0);
  });

  it('cues once per cueEveryHp healed', () => {
    let state: SiphonState = accrueSiphon(NEW_SIPHON, 1e6, 0.02, CFG);
    let healed = 0;
    let cues = 0;
    for (let i = 0; i < 60; i++) {
      state = accrueSiphon(state, 1e6, 0.02, CFG);
      const out = drainSiphon(state, SIM_STEP_MS / 1000, 100, CFG);
      healed += out.heal;
      if (out.cue) cues += 1;
      state = out.state;
    }
    expect(cues).toBe(Math.floor(healed / CFG.cueEveryHp + 1e-9));
    expect(cues).toBeLessThanOrEqual(3);
  });

  it('resets', () => {
    expect(resetSiphon()).toEqual(NEW_SIPHON);
    expect(resetSiphon()).not.toBe(NEW_SIPHON);
  });
});

describe('siphon — ranks', () => {
  it('scales the share by rank up to 2%', () => {
    expect([1, 2, 3, 4].map(shareAt)).toEqual([0.005, 0.01, 0.015, 0.02]);
  });

  it('never heals past the ceiling at any rank, with damage up to 1e6 a step', () => {
    const stepsMs = [8, 12, 16, SIM_STEP_MS, 20, 25];
    const MAX_STEP_MS = Math.max(...stepsMs);
    for (const rank of [1, 2, 3, 4]) {
      for (let seed = 1; seed <= 20; seed++) {
        const rng = createRng(seed * 10 + rank);
        const share = shareAt(rank);
        let state: SiphonState = NEW_SIPHON;
        const heals: number[] = [];
        const dts: number[] = [];
        for (let i = 0; i < 1500; i++) {
          const dt = (stepsMs[rng.int(0, stepsMs.length - 1)] as number) / 1000;
          // Quiet stretches, chip damage and huge bursts.
          const roll = rng.next();
          const landed = roll < 0.5 ? 0 : roll < 0.9 ? rng.next() * 500 : rng.next() * 1e6;
          state = accrueSiphon(state, landed, share, CFG);
          expect(state.pending).toBeLessThanOrEqual(CFG.maxHealPerS * CFG.bankS + 1e-9);
          const out = drainSiphon(state, dt, 1 + rng.next() * 100, CFG);
          expect(out.heal).toBeLessThanOrEqual(CFG.maxHealPerS * dt + 1e-9);
          state = out.state;
          heals.push(out.heal);
          dts.push(dt);
        }
        // Every run of steps covering one second heals no more than the ceiling over its length.
        const eps = (MAX_STEP_MS / 1000) * CFG.maxHealPerS;
        for (let i = 0; i < heals.length; i++) {
          let time = 0;
          let sum = 0;
          for (let j = i; j < heals.length && time < 1; j++) {
            time += dts[j] as number;
            sum += heals[j] as number;
          }
          expect(sum).toBeLessThanOrEqual(CFG.maxHealPerS + eps + 1e-9);
        }
      }
    }
  });

  it('keeps the ceiling at the fixed sim step with a permanent full bank', () => {
    let state: SiphonState = NEW_SIPHON;
    let total = 0;
    const steps = 600;
    for (let i = 0; i < steps; i++) {
      state = accrueSiphon(state, 1e6, shareAt(4), CFG);
      const out = drainSiphon(state, SIM_STEP_MS / 1000, 1000, CFG);
      total += out.heal;
      state = out.state;
    }
    expect(total).toBeLessThanOrEqual(CFG.maxHealPerS * ((steps * SIM_STEP_MS) / 1000) + 1e-9);
    expect(total).toBeGreaterThan(CFG.maxHealPerS * 9);
  });

  it('stops healing within bankS after the damage stops', () => {
    let state: SiphonState = accrueSiphon(NEW_SIPHON, 1e6, shareAt(4), CFG);
    let time = 0;
    let lastHeal = 0;
    while (time < 5) {
      const out = drainSiphon(state, SIM_STEP_MS / 1000, 100, CFG);
      state = out.state;
      time += SIM_STEP_MS / 1000;
      if (out.heal > 0) lastHeal = time;
    }
    expect(lastHeal).toBeLessThanOrEqual(CFG.bankS + SIM_STEP_MS / 1000 + 1e-9);
  });
});
