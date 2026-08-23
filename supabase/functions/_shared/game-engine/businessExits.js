// ============================================================================
// Business exit events — rare "sell for a multiple of annual revenue" offers
// ----------------------------------------------------------------------------
// Roughly once every ~6 months (BUSINESS_EXIT_CHANCE_PER_MONTH, a per-month
// coin flip rather than a fixed schedule, so it stays a surprise rather than
// clockwork) the table gets a shot at an acquisition offer: someone wants to
// buy ONE business, for a random multiple of its current ANNUAL revenue —
// monthly income × 12, the standard way a real business valuation is framed
// (1x/2x/4x/8x/15x — see BUSINESS_EXIT_MULTIPLIER_WEIGHTS in gameConfig.js,
// weighted so 2x/4x are common and 15x is a true jackpot). This directly
// rewards every dollar put into Marketing/Sales/Ops/R&D upgrades (see
// businessUpgrades.js) — a business earning more per month is worth more
// the instant an offer shows up, turning "should I upgrade this business"
// into a bet with a real, occasional jackpot payoff, not just a slow
// monthly trickle.
//
// RNG: every draw here is on the ENVIRONMENT stream (envChance/
// envWeightedPick/envRandomInt — see game/rng.js's module comment), same as
// weather/price/fortune cards — and, critically, drawn in a FIXED order
// every single month (chance first, then — only if it fires — multiplier
// and target-index) regardless of which players actually own a business.
// Skipping the multiplier/target draws on a month where nobody happens to
// own a business would make the environment stream's draw COUNT depend on
// player choices (who built a business, and when), which is exactly the
// class of Daily-Challenge-desync bug fixed earlier for Tree House rent —
// see rng.js's module comment. So the target index is always drawn against
// the FULL, fixed-size player roster; if that player turns out to own
// nothing, the offer is simply a no one-was-there no-op — same spirit as
// decks.js's perUnitCash effect quietly no-op'ing for a non-owner.
// ============================================================================
import { BUSINESS_EXIT_CHANCE_PER_MONTH, BUSINESS_EXIT_MULTIPLIER_WEIGHTS } from '../data/gameConfig';
import { envChance, envWeightedPick, envRandomInt } from './rng';
import { businessMonthlyIncome } from './players';

/**
 * Roll whether a business-exit offer fires this month and, if so, on which
 * player and business. Returns null if it didn't fire OR fired but landed
 * on a player with no business to sell — both are valid, silent, and (by
 * design — see the RNG note above) equally likely regardless of who
 * actually owns a business. Non-mutating: returns `{ playerId, businessId,
 * business, multiplier, income, annualIncome, payout }` for the caller
 * (turnEngine.js) to actually apply — `income` is the business's current
 * MONTHLY income (kept around for anything that still wants it),
 * `annualIncome` (`income * 12`) is what `multiplier` is actually applied
 * against.
 */
export function rollBusinessExit(players, month) {
  if (!envChance(BUSINESS_EXIT_CHANCE_PER_MONTH)) return null;
  const multiplier = Number(envWeightedPick(BUSINESS_EXIT_MULTIPLIER_WEIGHTS));
  const targetIndex = envRandomInt(0, players.length - 1);
  const target = players[targetIndex];
  if (!target || target.businesses.length === 0) return null;

  // Always the target's current most lucrative business — every fortune
  // card resolves automatically with no player choice involved, so this
  // stays consistent with that (and is the generous, unambiguous pick when
  // someone owns more than one).
  const business = [...target.businesses].sort(
    (a, b) => businessMonthlyIncome(b, month) - businessMonthlyIncome(a, month)
  )[0];
  const income = businessMonthlyIncome(business, month);
  const annualIncome = income * 12;
  const payout = Math.round(annualIncome * multiplier);

  return { playerId: target.id, businessId: business.id, business, multiplier, income, annualIncome, payout };
}
