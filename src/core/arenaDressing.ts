import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Where the arena's scatter props go at run start (#120).
 *
 * Every draw comes from the run's arena stream
 * (`createRng(deriveSeed(seed, 'arena'))`), never from the run RNG, so
 * dressing the floor cannot move an existing seed's spawns or level-up offers.
 *
 * Pure TS, no Phaser import. The tunables live in `config/arena.ts`.
 */

export interface PropRules {
  /** Clear space around every `keepClear` point. */
  clearRadius: number;
  /** From every other prop. */
  spacing: number;
  /** Inside the arena edge. */
  edgeMargin: number;
  /** Candidate spots tried in all before placement settles for fewer props. */
  maxAttempts: number;
}

export interface PlacedProp<F extends string = string> extends Vec2 {
  frame: F;
}

/**
 * Up to `count` props in a `world`-sized arena, each `clearRadius` from every
 * `keepClear` point, `spacing` from every other prop and `edgeMargin` inside
 * the edge, with a frame picked from `frames`. Rejection sampling, as relic
 * placement does: after `maxAttempts` candidates in all it returns the props
 * it has, fewer than `count`, rather than looping forever. A kept spot draws
 * its frame after its position, so the draws depend only on the rules.
 */
export function planProps<F extends string>(
  rng: Rng,
  world: { readonly width: number; readonly height: number },
  count: number,
  frames: readonly F[],
  keepClear: readonly Readonly<Vec2>[],
  rules: PropRules,
): PlacedProp<F>[] {
  const { clearRadius, spacing, edgeMargin, maxAttempts } = rules;
  const spanX = world.width - 2 * edgeMargin;
  const spanY = world.height - 2 * edgeMargin;
  const props: PlacedProp<F>[] = [];
  if (spanX < 0 || spanY < 0 || frames.length === 0) return props;
  const clear = (a: Readonly<Vec2>, b: Readonly<Vec2>, gap: number): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) >= gap;
  for (let attempt = 0; attempt < maxAttempts && props.length < count; attempt++) {
    const spot = { x: edgeMargin + rng.next() * spanX, y: edgeMargin + rng.next() * spanY };
    if (keepClear.some((point) => !clear(spot, point, clearRadius))) continue;
    if (props.some((other) => !clear(spot, other, spacing))) continue;
    props.push({ ...spot, frame: rng.pick(frames) });
  }
  return props;
}
