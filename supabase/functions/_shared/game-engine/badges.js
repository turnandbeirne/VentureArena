// ============================================================================
// Badge / achievement engine — extensible by design
// ----------------------------------------------------------------------------
// Badge DATA lives in gameConfig.js. This file just knows how to check a
// small set of generic "kind"s against a player's state. Adding a badge
// that fits an existing kind (passiveIncomeAtLeast, businessCountAtLeast,
// assetHoldingAtLeast, ...) requires ZERO changes here — just add an entry
// to BADGES in gameConfig.js.
//
// `badgeEvents` on each player ({ badgeId, month }) is the hook future
// VentureScouts integration can read from to sync earned badges externally
// — see exportBadgeEvents() below.
// ============================================================================
import { ASSETS, BADGES } from '../data/gameConfig';
import { passiveIncome, businessMonthlyIncome } from './players';

/** Every business's current monthly income, summed, for one player — used
 * by the "most lucrative businesses at the table" checker below. Needs
 * `month` (see businessMonthlyIncome in players.js) since a business's
 * income can grow over time via Marketing/Sales/Ops/R&D upgrades. */
function totalBusinessIncome(player, month) {
  return player.businesses.reduce((sum, b) => sum + businessMonthlyIncome(b, month), 0);
}

const CHECKERS = {
  passiveIncomeAtLeast: (player, badge, context) => passiveIncome(player, context) >= badge.value,
  businessCountAtLeast: (player, badge) => player.businesses.length >= badge.value,
  assetHoldingAtLeast: (player, badge) => (player.holdings[badge.assetId] || 0) >= badge.value,
  // How many DIFFERENT asset kinds a player currently holds any of at all
  // (mirrors game/insights.js's diversityCount, kept separate rather than
  // shared since that one only needs a player and this one needs the badge
  // threshold too) — rewards spreading out, not just owning a lot of one
  // thing.
  assetDiversityAtLeast: (player, badge) =>
    ASSETS.filter((a) => (player.holdings[a.id] || 0) > 0).length >= badge.value,
  // How many business-exit buyouts this player has ever cashed in on — see
  // game/businessExits.js/turnEngine.js, which append to soldBusinesses
  // every time one lands.
  businessesSoldAtLeast: (player, badge) => (player.soldBusinesses || []).length >= badge.value,
  // Relative, table-wide checks (unlike every checker above, which only
  // looks at one player) — need context.allPlayers, the full player list
  // for this month, threaded through from turnEngine.js's badgeContext.
  // Ties count as "the most" (multiple players can earn these the same
  // month) rather than picking a single arbitrary winner.
  mostBusinessesAtTable: (player, badge, context) => {
    const allPlayers = context.allPlayers || [player];
    const maxCount = Math.max(...allPlayers.map((p) => p.businesses.length));
    return maxCount > 0 && player.businesses.length >= badge.value && player.businesses.length === maxCount;
  },
  mostLucrativeBusinessesAtTable: (player, badge, context) => {
    const allPlayers = context.allPlayers || [player];
    const mine = totalBusinessIncome(player, context.month);
    const maxIncome = Math.max(...allPlayers.map((p) => totalBusinessIncome(p, context.month)));
    return maxIncome > 0 && mine >= badge.value && mine === maxIncome;
  },
};

/**
 * Evaluate all badges for a player, returning a new player object with any
 * newly-earned badges appended (and logged into badgeEvents with the month
 * they were earned). Non-mutating. `context` (optional — { allPlayers,
 * prices }) is passed straight through to passiveIncome() for the
 * passiveIncomeAtLeast check, which now needs to know everyone's Tree House
 * holdings and current prices to compute dynamic rent (see players.js).
 */
export function evaluateBadges(player, month, context = {}) {
  const earnedSet = new Set(player.badges || []);
  const newlyEarned = [];
  const fullContext = { ...context, month };

  for (const badge of BADGES) {
    if (earnedSet.has(badge.id)) continue;
    const checker = CHECKERS[badge.kind];
    if (!checker) continue;
    if (checker(player, badge, fullContext)) {
      earnedSet.add(badge.id);
      newlyEarned.push(badge);
    }
  }

  if (newlyEarned.length === 0) return { player, newlyEarned };

  return {
    player: {
      ...player,
      badges: Array.from(earnedSet),
      badgeEvents: [
        ...(player.badgeEvents || []),
        ...newlyEarned.map((b) => ({ badgeId: b.id, month })),
      ],
    },
    newlyEarned,
  };
}

/** Registry lookup for rendering (icon/name/description) by id. */
export function getBadgeInfo(badgeId) {
  return BADGES.find((b) => b.id === badgeId);
}

/**
 * Extension point for VentureScouts: flatten a player's badge history into
 * a plain, serializable event list ready to sync/export elsewhere.
 */
export function exportBadgeEvents(player) {
  return (player.badgeEvents || []).map((event) => ({
    playerId: player.id,
    playerName: player.name,
    badgeId: event.badgeId,
    month: event.month,
  }));
}
