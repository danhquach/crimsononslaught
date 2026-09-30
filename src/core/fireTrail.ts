import { FIRE_TRAIL, SCORCH_VARIANTS } from '../config/fireLevels';
import { BASE_FIRE_WAVE_STATS } from '../config/fireRoster';
import type { SpellLevel } from '../config/spellLevels';
import { fadeOutAlpha } from './fx';
import { inArc } from './fireWave';
import type { Vec2 } from './input';
import type { Rng } from './rng';

/**
 * Fire Wave level 3's burnt ground that do not need an engine (#327): where the
 * scorch pieces lie over the swept fan, which ring the rim has passed, and who
 * stands in the burn. `spells/FireWaveSpell.ts` runs it from `tick`.
 *
 * One zone per wave. Its layout is drawn once, at the cast, from a stream of its
 * own, so frame splits and `?timeScale=` never change it; rings are laid as the
 * rim passes them. Levels 1 and 2 have no zone and draw nothing from the RNG.
 *
 * Pure TS, no Phaser import; the numbers live in `config/fireLevels.ts`.
 */

/** Whether a Fire Wave leaves burnt ground. */
export function hasFireTrail(level: SpellLevel): boolean {
  return level >= 3;
}

/** One place a scorch piece goes: which ring, how far out (share of range), and its angle off the heading. */
export interface ScorchSlot {
  ring: number;
  rFrac: number;
  angle: number;
}

/**
 * The slots for an `arcDeg` wave: evenly spaced rings from `innerFrac` to
 * `outerFrac`, each ring holding enough pieces to overlap along its length. In
 * shares of range, so the count is the same whatever Expanse does to the range.
 */
export function scorchSlots(
  arcDeg: number,
  rule: typeof FIRE_TRAIL = FIRE_TRAIL,
  baseRange: number = BASE_FIRE_WAVE_STATS.range,
): ScorchSlot[] {
  const s = (rule.step * rule.pieceSpan) / baseRange;
  const halfArc = (arcDeg * Math.PI) / 360;
  const rings = Math.max(2, Math.round((rule.outerFrac - rule.innerFrac) / s) + 1);
  const slots: ScorchSlot[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const rFrac = rule.innerFrac + ((rule.outerFrac - rule.innerFrac) * ring) / (rings - 1);
    const n = Math.ceil((rFrac * 2 * halfArc * rule.arcInset) / s) + 1;
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0 : (2 * i) / (n - 1) - 1;
      slots.push({ ring, rFrac, angle: t * rule.arcInset * halfArc });
    }
  }
  return slots;
}

/** One scorch piece, placed: `scale` is its drawn span as a factor of `pieceSpan` at the base range. */
export interface ScorchPiece {
  ring: number;
  x: number;
  y: number;
  rotation: number;
  flipX: boolean;
  scale: number;
  variant: number;
  flame: boolean;
}

/**
 * Place every slot for a wave cast at `origin` toward `heading`, with `range`
 * and `arcDeg` as cast. Each slot draws a fixed six numbers from `rng` (radial
 * and along jitter, turn, flip, size, variant), then the flames are dealt to
 * middle-ring pieces, so the draw count depends on the arc alone.
 */
export function scorchPieces(
  origin: Readonly<Vec2>,
  heading: number,
  range: number,
  arcDeg: number,
  rng: Rng,
  rule: typeof FIRE_TRAIL = FIRE_TRAIL,
  variants: number = SCORCH_VARIANTS,
): ScorchPiece[] {
  const slots = scorchSlots(arcDeg, rule);
  const jitter = rule.jitter * ((rule.step * rule.pieceSpan) / BASE_FIRE_WAVE_STATS.range) * range;
  const last = slots[slots.length - 1]?.ring ?? 0;
  const pieces = slots.map((slot): ScorchPiece => {
    const radial = (rng.next() * 2 - 1) * jitter;
    const along = (rng.next() * 2 - 1) * jitter;
    const rotation = rng.next() * Math.PI * 2;
    const flipX = rng.next() < 0.5;
    const scale = rule.scale.min + rng.next() * (rule.scale.max - rule.scale.min);
    const variant = rng.int(0, variants - 1);
    const angle = heading + slot.angle;
    const r = slot.rFrac * range + radial;
    return {
      ring: slot.ring,
      x: origin.x + Math.cos(angle) * r - Math.sin(angle) * along,
      y: origin.y + Math.sin(angle) * r + Math.cos(angle) * along,
      rotation,
      flipX,
      scale,
      variant,
      flame: false,
    };
  });
  const middle = pieces.map((p, i) => (p.ring > 0 && p.ring < last ? i : -1)).filter((i) => i >= 0);
  for (const i of rng.shuffle(middle).slice(0, rule.flames))
    (pieces[i] as ScorchPiece).flame = true;
  return pieces;
}

/** The rim radii, in px, at which each ring of a wave with this `range` lies. */
export function trailRingRadii(range: number, rule: typeof FIRE_TRAIL = FIRE_TRAIL): number[] {
  const radii: number[] = [];
  for (const slot of scorchSlots(0, rule)) radii[slot.ring] = slot.rFrac * range;
  return radii;
}

/**
 * The rings to lay this frame: those whose radius plus `lagPx` (capped at
 * `range`, so the outer ring is laid as the rim reaches it) the rim crossed
 * going from `prevR` to `r`, nearest first. A rim that did not move forward, or
 * a bad number, lays nothing.
 */
export function ringsDue(
  prevR: number,
  r: number,
  radii: readonly number[],
  lagPx: number,
  range: number,
): number[] {
  const due: number[] = [];
  if (!(r > prevR)) return due;
  radii.forEach((radius, i) => {
    const at = Math.min(range, radius + lagPx);
    if (prevR < at && at <= r) due.push(i);
  });
  return due;
}

/**
 * Whether an enemy stands in the burnt ground: its body overlaps the annular
 * sector between `rMin` and the rim's swept radius `rSwept`, inside the wave's
 * arc. Empty until the rim is past `rMin`.
 */
export function inSweptSector(
  origin: Readonly<Vec2>,
  heading: number,
  halfArc: number,
  rMin: number,
  rSwept: number,
  enemy: Readonly<Vec2>,
  bodyRadius: number,
): boolean {
  if (!(rSwept > rMin)) return false;
  const body = Math.max(0, bodyRadius);
  const dist = Math.hypot(enemy.x - origin.x, enemy.y - origin.y);
  return (
    dist - body <= rSwept && dist + body >= rMin && inArc(origin, heading, halfArc, enemy, body)
  );
}

/** A zone's clock: its age, when its wave ended (null while it is out) and the time to the next burn tick. */
export interface TrailClock {
  ageS: number;
  closedAtS: number | null;
  tickLeftS: number;
}

/**
 * Advance a zone's clock by `deltaS`, in place. `tick` is true at most once a
 * frame, on the first frame and then every `tickEveryS`; `expired` once `holdS`
 * has passed since its wave ended (never while it is out); `alpha` is the
 * ground's opacity, whole until the last `fadeS`.
 */
export function stepTrailClock(
  clock: TrailClock,
  deltaS: number,
  rule: typeof FIRE_TRAIL = FIRE_TRAIL,
): { tick: boolean; expired: boolean; alpha: number } {
  clock.ageS += deltaS;
  clock.tickLeftS -= deltaS;
  const tick = clock.tickLeftS <= 0;
  if (tick) clock.tickLeftS = rule.tickEveryS;
  if (clock.closedAtS === null) return { tick, expired: false, alpha: rule.alpha };
  const remaining = rule.holdS - (clock.ageS - clock.closedAtS);
  return { tick, expired: remaining <= 0, alpha: rule.alpha * fadeOutAlpha(remaining, rule.fadeS) };
}

/** The burn the ground gives, dps: a fraction of the wave's own. */
export function trailBurnDps(waveBurn: number, factor: number = FIRE_TRAIL.burnFactor): number {
  return waveBurn * factor;
}
