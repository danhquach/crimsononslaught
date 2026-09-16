/**
 * Event contract between `RunState` (CO-030) and its listeners, chiefly the
 * HUD (CO-012). RunState emits these on the Game scene's event emitter;
 * listeners never poll GameScene internals.
 *
 * Every payload carries absolute values (current hp, total kills, ...), not
 * deltas, so a listener can render from its latest event alone and a listener
 * that subscribes late is correct after one event per channel.
 *
 * Pure TS, no Phaser import.
 */

export type RunPhase = 'waves' | 'boss' | 'over';

/** Emitter event names, namespaced so they can never collide with Phaser's own scene events. */
export const RUN_EVENT = {
  timer: 'run:timer',
  hp: 'run:hp',
  xp: 'run:xp',
  kill: 'run:kill',
  phase: 'run:phase',
  bossHp: 'run:bossHp',
} as const;

export type RunEventName = keyof typeof RUN_EVENT;

export const RUN_EVENT_NAMES = Object.keys(RUN_EVENT) as readonly RunEventName[];

export interface RunEventPayloads {
  /** Run clock; frozen while Game is paused. */
  timer: { elapsedMs: number };
  hp: { hp: number; maxHp: number };
  /** `xp` is progress inside the current level; `xpToNext` is that level's threshold. */
  xp: { xp: number; xpToNext: number; level: number };
  kill: { kills: number };
  phase: { phase: RunPhase };
  bossHp: { hp: number; maxHp: number };
}

/** Discriminated union of every event, for reducers that handle them uniformly. */
export type RunEvent = {
  [K in RunEventName]: { name: K; payload: RunEventPayloads[K] };
}[RunEventName];

/** The slice of an emitter this contract needs; `Phaser.Events.EventEmitter` satisfies it. */
export interface RunEventEmitter {
  emit(event: string, ...args: unknown[]): unknown;
  on(event: string, fn: (payload: unknown) => void): unknown;
  off(event: string, fn: (payload: unknown) => void): unknown;
}

/** Type-safe emit: the payload must match the event's declared shape. */
export function emitRunEvent<K extends RunEventName>(
  emitter: Pick<RunEventEmitter, 'emit'>,
  name: K,
  payload: RunEventPayloads[K],
): void {
  emitter.emit(RUN_EVENT[name], payload);
}

/**
 * Subscribe one listener to every run event, delivered as a `RunEvent`.
 * Returns the matching unsubscribe. The single cast below is the one place the
 * emitter's untyped payload is re-associated with its name; `runEvents.test.ts`
 * pins that mapping for every channel.
 */
export function onRunEvents(
  emitter: RunEventEmitter,
  listener: (event: RunEvent) => void,
): () => void {
  const handlers = RUN_EVENT_NAMES.map((name) => {
    const handler = (payload: unknown): void => listener({ name, payload } as RunEvent);
    emitter.on(RUN_EVENT[name], handler);
    return [RUN_EVENT[name], handler] as const;
  });
  return () => {
    for (const [event, handler] of handlers) emitter.off(event, handler);
  };
}
