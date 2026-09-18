import { describe, expect, it } from 'vitest';
import { OverlayLedger } from './overlayPool';

const want = (entries: [string, string][]): ReadonlyMap<string, string> => new Map(entries);

describe('OverlayLedger (CO-082)', () => {
  it('starts empty', () => {
    expect(new OverlayLedger<string>(3).count).toBe(0);
  });

  it('acquires an overlay for every host that wants one', () => {
    const ledger = new OverlayLedger<string>(10);
    const changes = ledger.sync(
      want([
        ['a', 'fire.burn'],
        ['b', 'ice.slow'],
      ]),
    );
    expect(changes.acquired).toEqual([
      ['a', 'fire.burn'],
      ['b', 'ice.slow'],
    ]);
    expect(changes.released).toEqual([]);
    expect(ledger.count).toBe(2);
    expect(ledger.clipOf('a')).toBe('fire.burn');
  });

  it('leaves an unchanged overlay alone from frame to frame', () => {
    const ledger = new OverlayLedger<string>(10);
    ledger.sync(want([['a', 'fire.burn']]));
    const changes = ledger.sync(want([['a', 'fire.burn']]));
    expect(changes.acquired).toEqual([]);
    expect(changes.released).toEqual([]);
    expect(ledger.count).toBe(1);
  });

  it('releases a host that stopped wanting one — status over or host dead', () => {
    const ledger = new OverlayLedger<string>(10);
    ledger.sync(
      want([
        ['a', 'fire.burn'],
        ['b', 'fire.burn'],
      ]),
    );
    const changes = ledger.sync(want([['b', 'fire.burn']]));
    expect(changes.released).toEqual(['a']);
    expect(changes.acquired).toEqual([]);
    expect(ledger.count).toBe(1);
    expect(ledger.clipOf('a')).toBeUndefined();
  });

  it('swaps the clip when a host needs a different overlay', () => {
    const ledger = new OverlayLedger<string>(10);
    ledger.sync(want([['a', 'ice.slow']]));
    const changes = ledger.sync(want([['a', 'ice.freeze']]));
    expect(changes.released).toEqual(['a']);
    expect(changes.acquired).toEqual([['a', 'ice.freeze']]);
    expect(ledger.count).toBe(1);
    expect(ledger.clipOf('a')).toBe('ice.freeze');
  });

  it('returns to zero when every host is gone', () => {
    const ledger = new OverlayLedger<string>(10);
    ledger.sync(
      want([
        ['a', 'fire.burn'],
        ['b', 'ice.slow'],
        ['c', 'lightning.stun'],
      ]),
    );
    const changes = ledger.sync(new Map());
    expect([...changes.released].sort()).toEqual(['a', 'b', 'c']);
    expect(ledger.count).toBe(0);
  });

  it('never exceeds its capacity and drops the surplus rather than queueing it', () => {
    const ledger = new OverlayLedger<string>(2);
    const changes = ledger.sync(
      want([
        ['a', 'x'],
        ['b', 'x'],
        ['c', 'x'],
      ]),
    );
    expect(changes.acquired.map(([host]) => host)).toEqual(['a', 'b']);
    expect(ledger.count).toBe(2);
    // The dropped host is not remembered: it is only taken when a slot is free.
    const later = ledger.sync(
      want([
        ['b', 'x'],
        ['c', 'x'],
      ]),
    );
    expect(later.released).toEqual(['a']);
    expect(later.acquired).toEqual([['c', 'x']]);
    expect(ledger.count).toBe(2);
  });

  it('frees a slot in the same frame a host leaves, so a newcomer can take it', () => {
    const ledger = new OverlayLedger<string>(1);
    ledger.sync(want([['a', 'x']]));
    const changes = ledger.sync(want([['b', 'x']]));
    expect(changes.released).toEqual(['a']);
    expect(changes.acquired).toEqual([['b', 'x']]);
  });

  it('clear frees everything and reports what it freed', () => {
    const ledger = new OverlayLedger<string>(10);
    ledger.sync(
      want([
        ['a', 'x'],
        ['b', 'y'],
      ]),
    );
    expect(ledger.clear().sort()).toEqual(['a', 'b']);
    expect(ledger.count).toBe(0);
  });
});
