// The bot's level-up policy (#407): index of the card to take. The #406 bot never
// preferred actives (its open-slot count was always 0); preferring them here differs
// only on mixed offers, which the game never makes (a slot open means all-active
// offers), so results stay comparable.
const PASSIVE_ORDER = ['passive_power', 'passive_haste', 'passive_expanse', 'passive_persistence'];

/** `cards` is the level-up view's `{kind, id}` list (at most three); returns an index. */
export function chooseCard(cards) {
  if (!cards || !cards.length) return 0;
  const find = (pred) => cards.findIndex(pred);
  let i = find((c) => c.kind === 'active');
  if (i >= 0) return i;
  i = find((c) => c.kind === 'upgrade');
  if (i >= 0) return i;
  for (const id of PASSIVE_ORDER) {
    i = find((c) => c.id === id);
    if (i >= 0) return i;
  }
  i = find((c) => c.kind === 'passive');
  if (i >= 0) return i;
  i = find((c) => c.kind === 'relic');
  return i >= 0 ? i : 0;
}
