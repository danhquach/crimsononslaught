/**
 * Bookkeeping for status overlays (CO-082): which host shows which clip,
 * under a hard cap, decided without an engine.
 *
 * `systems/OverlayPool.ts` is the Phaser side: it asks `sync` what changed
 * and only then takes or frees sprites. Pure TS, no Phaser import.
 */

export interface OverlayChanges<H> {
  /** Hosts that need a sprite showing `clip`, in the order they were wanted. */
  readonly acquired: readonly (readonly [host: H, clip: string])[];
  /** Hosts whose sprite must be freed — status over, host gone, or clip changed. */
  readonly released: readonly H[];
}

/**
 * The set of overlays out right now. `sync` is handed every host that wants
 * one this frame and reconciles: a host not listed loses its overlay, a host
 * whose clip changed is released then re-acquired, and a host past `capacity`
 * is dropped, never queued — the rule every pool follows.
 */
export class OverlayLedger<H> {
  readonly capacity: number;
  private readonly shown = new Map<H, string>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  /** Overlays out right now. */
  get count(): number {
    return this.shown.size;
  }

  /** The clip `host` shows, or undefined for none. */
  clipOf(host: H): string | undefined {
    return this.shown.get(host);
  }

  sync(wanted: ReadonlyMap<H, string>): OverlayChanges<H> {
    const released: H[] = [];
    for (const [host, clip] of this.shown) {
      if (wanted.get(host) !== clip) {
        released.push(host);
        this.shown.delete(host);
      }
    }
    const acquired: (readonly [H, string])[] = [];
    for (const [host, clip] of wanted) {
      if (this.shown.has(host)) continue;
      if (this.shown.size >= this.capacity) break;
      this.shown.set(host, clip);
      acquired.push([host, clip]);
    }
    return { acquired, released };
  }

  /** Free everything, for a scene that is ending. */
  clear(): H[] {
    const released = [...this.shown.keys()];
    this.shown.clear();
    return released;
  }
}
