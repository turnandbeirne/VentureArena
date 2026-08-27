import { wealthPileTiers } from '../game/wealthPile';

/**
 * The little cluster of icons that piles up next to a player's name as
 * their net worth grows — see game/wealthPile.js for the tier thresholds.
 * Renders nothing below the first tier, so a fresh player's name starts
 * out clean rather than showing an empty pile.
 */
export default function WealthPile({ netWorth }) {
  const tiers = wealthPileTiers(netWorth);
  if (tiers.length === 0) return null;

  return (
    <span
      className="vf-wealth-pile"
      title={`Wealth pile — $${Math.round(netWorth).toLocaleString()} net worth: ${tiers.map((t) => t.label).join(', ')}`}
    >
      {tiers.map((tier, i) => (
        <span key={tier.icon} className="vf-wealth-pile__icon" style={{ '--vf-pile-i': i }}>
          {tier.icon}
        </span>
      ))}
    </span>
  );
}
