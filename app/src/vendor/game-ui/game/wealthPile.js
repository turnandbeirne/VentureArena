// ============================================================================
// Wealth pile — a visual "stack" of icons next to a player's name that
// grows as their net worth grows: coins first, then cash bundles, jewels,
// and finally big-ticket toys (a car, a house, a yacht). Purely cosmetic —
// derived entirely from net worth, nothing here is read by any other game
// system — but kept in game/ rather than components/ to match this
// project's convention of pure, presentation-agnostic logic living
// separately from the React that renders it (see businessHealthStatus in
// businessUpgrades.js for the same pattern).
// ============================================================================

/** Each tier's `threshold` is the net worth (inclusive) at which its icon
 * joins the pile — tiers are cumulative, so a player past the last
 * threshold shows every icon at once, reading as a genuine "pile" that
 * keeps growing rather than one icon that just gets swapped out. Ordered
 * roughly the way a growing fortune would actually look: loose change,
 * then folding cash, then jewelry, then the big lifestyle purchases. */
export const WEALTH_PILE_TIERS = [
  { threshold: 500, icon: '🪙', label: 'A little loose change' },
  { threshold: 2500, icon: '💵', label: 'Stacks of cash' },
  { threshold: 10000, icon: '💰', label: 'Money bags' },
  { threshold: 25000, icon: '💎', label: 'Jewels' },
  { threshold: 50000, icon: '🚗', label: 'A sports car' },
  { threshold: 100000, icon: '🏠', label: 'A house' },
  { threshold: 250000, icon: '🛥️', label: 'A yacht' },
];

/** Every tier a player's current net worth has reached, in ascending
 * (oldest/smallest-first) order — an empty array below the first
 * threshold, since there's nothing to show for a player who hasn't built
 * up any real wealth yet. */
export function wealthPileTiers(netWorth) {
  if (netWorth == null) return [];
  return WEALTH_PILE_TIERS.filter((tier) => netWorth >= tier.threshold);
}
