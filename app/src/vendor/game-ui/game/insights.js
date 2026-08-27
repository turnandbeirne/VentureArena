// ============================================================================
// Game-over insight callouts
// ----------------------------------------------------------------------------
// A couple of plain-language observations built from a player's OWN
// playthrough (net worth history + final holdings) — meant to reinforce the
// "why" lessons (see game/lessons.js) with something concrete and personal
// rather than a generic tip. Heuristic, not financial advice — phrased as
// observations about what happened, not judgments about what should have.
// ============================================================================
import { ASSETS } from '../../data/gameConfig';
import { netWorth } from '../../game-engine/players';

// A concentration warning only actually means something if the asset in
// question is genuinely volatile — being 90% Piggy Bank is concentrated
// too, but it's not risky, so it shouldn't read like a warning. Anything at
// or above Lemonade Stand's volatility (0.15) counts as "genuinely
// volatile" here; Treasure Chest (0.40) is comfortably above this.
const VOLATILE_THRESHOLD = 0.15;
const CONCENTRATION_SHARE_THRESHOLD = 0.4;

function biggestSwing(history) {
  let best = null;
  for (let i = 1; i < history.length; i++) {
    const delta = history[i].netWorth - history[i - 1].netWorth;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      best = { month: history[i].month, delta };
    }
  }
  return best;
}

function diversityCount(player) {
  return ASSETS.filter((a) => (player.holdings[a.id] || 0) > 0).length;
}

/**
 * Whichever currently-held asset is the player's biggest exposure to real
 * volatility, and what share of their net worth it makes up. This is a
 * CURRENT-holdings approximation, not a true month-by-month causal
 * attribution (the game doesn't keep a per-player, per-asset value history
 * to compute that precisely) — but a player who ends the game heavily
 * concentrated in Treasure Chest almost certainly has it to thank (or
 * blame) for most of their swings, so naming it is honest even without
 * perfect historical bookkeeping. Returns null if the player holds nothing
 * or has ~$0 net worth (share would be meaningless).
 */
function riskiestConcentration(player, prices) {
  const held = ASSETS.filter((a) => (player.holdings[a.id] || 0) > 0);
  if (held.length === 0) return null;
  const riskiest = [...held].sort((a, b) => b.volatility - a.volatility)[0];
  const netW = netWorth(player, prices);
  if (netW <= 0) return null;
  const qty = player.holdings[riskiest.id] || 0;
  const price = prices[riskiest.id] ?? riskiest.basePrice;
  return { asset: riskiest, share: (qty * price) / netW };
}

/**
 * Build up to a couple of observations about one player's playthrough.
 * Returns an array of `{ icon, text }`. Deliberately modest in scope (a
 * biggest-swing note + a diversification note) — this reflects the
 * player's own numbers back at them rather than trying to be a full
 * analysis engine. `prices` (current asset prices) is needed to value a
 * concentrated holding for the riskiestConcentration check below.
 */
export function buildInsights(player, prices = {}) {
  const insights = [];
  const history = player.netWorthHistory || [];
  if (history.length >= 2) {
    const swing = biggestSwing(history);
    if (swing && swing.delta > 0) {
      insights.push({
        icon: '📈',
        text: `Your best month was month ${swing.month}, when your net worth jumped by $${swing.delta.toLocaleString()}.`,
      });
    } else if (swing && swing.delta < 0) {
      insights.push({
        icon: '📉',
        text: `Month ${swing.month} was your toughest, dropping $${Math.abs(swing.delta).toLocaleString()} — a good reminder that spreading your money across a few different things can help soften a rough month.`,
      });
    }
  }

  const diversity = diversityCount(player);
  if (diversity >= 3) {
    insights.push({
      icon: '🧺',
      text: `You held ${diversity} different kinds of assets by the end — that spread-out approach is called diversification, and it helps protect you if any one thing drops.`,
    });
  } else {
    // Below the "well-diversified" bar — see if there's a specific,
    // genuinely risky concentration worth calling out by name before
    // falling back to the generic low-diversity nudge.
    const concentration = riskiestConcentration(player, prices);
    if (
      concentration &&
      concentration.share >= CONCENTRATION_SHARE_THRESHOLD &&
      concentration.asset.volatility >= VOLATILE_THRESHOLD
    ) {
      insights.push({
        icon: concentration.asset.icon,
        text: `${Math.round(concentration.share * 100)}% of your money was in ${
          concentration.asset.name
        } by the end — the most volatile thing you held. Exciting when it climbs, but it's very likely why your net worth swung around the most this game.`,
      });
    } else if (diversity <= 1) {
      insights.push({
        icon: '🎯',
        text: `You mostly stuck to one kind of asset this game. That can pay off, but spreading out across a few (diversifying) usually lowers your risk.`,
      });
    }
  }

  return insights.slice(0, 2);
}
