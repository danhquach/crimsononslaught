/**
 * Who wins a run in which the boss and the hero both die (#315). Each has a
 * death clip (the hero's is shorter than the boss's), and the run used to end
 * on whichever clip finished first: a hero dropping to 0 HP a quarter second
 * after the boss's killing blow recorded a loss with the boss's Embers already
 * banked, and one dropping later, before the boss's clip ended, a win over a
 * corpse.
 *
 * The killing blow decides instead. If the hero is already dead when the boss
 * takes it, the run is lost; otherwise it is won, and from that moment nothing
 * can hurt the hero. The first decision stands. The clips still play and the
 * death events still fire; `endRun` just reads the decision.
 *
 * Pure TS, no Phaser import.
 */

/** What a boss kill settles: the run is won or lost, not (yet) abandoned. */
export type DecidedOutcome = 'win' | 'lose';

/**
 * The boss takes its killing blow. `decided` is what an earlier blow settled,
 * if any, and stands; else `heroDead` says who got there first.
 */
export function decideOnBossKill(
  decided: DecidedOutcome | undefined,
  heroDead: boolean,
): DecidedOutcome {
  return decided ?? (heroDead ? 'lose' : 'win');
}

/** Whether the hero can still be hurt: not once the boss's blow has won the run. */
export function heroHurtable(decided: DecidedOutcome | undefined): boolean {
  return decided !== 'win';
}

/**
 * The outcome to record when a death event or an early exit asks for
 * `reached`: what the killing blow decided, else what was asked for.
 */
export function settleOutcome<T extends string>(
  decided: DecidedOutcome | undefined,
  reached: T,
): T | DecidedOutcome {
  return decided ?? reached;
}
