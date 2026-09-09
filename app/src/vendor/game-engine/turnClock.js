// ============================================================================
// Turn ordinal — "which turn is this, counting from the start of the game"
// ----------------------------------------------------------------------------
// Derived from state rather than stored: month 1's first seat is 0, counting
// up one per seat per month. Unlike `month` it distinguishes the four seats
// within a single month, which is what "this turn" has to mean at a table of
// more than one.
//
// Three separate features need exactly this number — coalescing repeated
// trades in the event log, keeping a bot from repeating a line within six
// turns, and the same-turn sell penalty — so it lives in one place rather
// than being re-derived slightly differently in each.
// ============================================================================

export function turnOrdinal(state) {
  const seats = state?.players?.length || 1;
  return ((state?.month || 1) - 1) * seats + (state?.activePlayerIndex || 0);
}

/**
 * Read a per-turn tally that clears itself. Instead of resetting a counter
 * at every hand-off — which is easy to forget on one code path and leaves a
 * stale value behind when it's missed — the tally records WHICH turn it
 * belongs to, and anything from an earlier turn simply reads as empty.
 */
export function currentTurnTally(tally, turnNo) {
  return tally && tally.turnNo === turnNo ? tally.counts || {} : {};
}
