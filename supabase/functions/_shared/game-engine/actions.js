// ============================================================================
// Player actions — pure state-transform helpers
// ----------------------------------------------------------------------------
// Each function takes the full game state + args and returns a new game
// state (plus ok/error/logEntry). These are the ONLY place player money
// actually moves, so both human dispatch (reducer.js) and the AI
// (aiEngine.js) call through here — one set of rules, two callers.
// ============================================================================
import { getAssetConfig } from './market';
import {
  BUSINESS_COST,
  BUSINESS_SKILL_COST,
  BUSINESS_INCOME_MIN,
  BUSINESS_INCOME_MAX,
  SKILL_COST,
  BUSINESS_NAMES,
  BUSINESS_UPGRADE_TRACKS,
} from '../data/gameConfig';
import { randomInt, pickRandom } from './rng';
import { upgradeCost, canUpgradeTrack, applyUpgrade, upgradeBlockReason } from './businessUpgrades';

/** A random whimsical name for a new business, preferring one this player
 * hasn't already used this game (500 names is far more than any game will
 * exhaust, but a player 500 businesses deep just gets a repeat rather than
 * an error). */
function pickBusinessName(existingBusinesses) {
  const used = new Set(existingBusinesses.map((b) => b.name).filter(Boolean));
  const available = BUSINESS_NAMES.filter((name) => !used.has(name));
  return pickRandom(available.length > 0 ? available : BUSINESS_NAMES);
}

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? updater(p) : p)),
  };
}

function findPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId);
}

export function buyAsset(state, playerId, assetId, qty = 1) {
  const player = findPlayer(state, playerId);
  const asset = getAssetConfig(assetId);
  if (!player || !asset || qty <= 0) return { state, ok: false, error: 'Invalid purchase.' };

  const price = state.assetPrices[assetId];
  const cost = Math.round(price * qty);
  if (player.cash < cost) return { state, ok: false, error: `Not enough cash for ${asset.name}.` };

  const nextState = updatePlayer(state, playerId, (p) => ({
    ...p,
    cash: p.cash - cost,
    holdings: { ...p.holdings, [assetId]: (p.holdings[assetId] || 0) + qty },
    purchaseStats: {
      ...p.purchaseStats,
      [assetId]: {
        qty: (p.purchaseStats?.[assetId]?.qty || 0) + qty,
        spent: (p.purchaseStats?.[assetId]?.spent || 0) + cost,
      },
    },
    ledger: [
      ...(p.ledger || []),
      { month: state.month, type: 'out', amount: cost, source: `Bought ${asset.name}`, detail: qty > 1 ? `${qty} units` : undefined },
    ],
  }));

  return {
    state: nextState,
    ok: true,
    logEntry: { icon: asset.icon, message: `bought ${asset.name}`, kind: `buy_${assetId}`, playerId },
  };
}

export function sellAsset(state, playerId, assetId, qty = 1) {
  const player = findPlayer(state, playerId);
  const asset = getAssetConfig(assetId);
  if (!player || !asset || qty <= 0) return { state, ok: false, error: 'Invalid sale.' };

  const owned = player.holdings[assetId] || 0;
  if (owned < qty) return { state, ok: false, error: `You don't own that many ${asset.name}.` };

  const price = state.assetPrices[assetId];
  const proceeds = Math.round(price * qty);

  const nextState = updatePlayer(state, playerId, (p) => ({
    ...p,
    cash: p.cash + proceeds,
    holdings: { ...p.holdings, [assetId]: owned - qty },
    ledger: [
      ...(p.ledger || []),
      { month: state.month, type: 'in', amount: proceeds, source: `Sold ${asset.name}`, detail: qty > 1 ? `${qty} units` : undefined },
    ],
  }));

  return {
    state: nextState,
    ok: true,
    logEntry: { icon: asset.icon, message: `sold ${asset.name}`, kind: `sell_${assetId}`, playerId },
  };
}

export function startBusiness(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) return { state, ok: false, error: 'Invalid player.' };
  if (player.cash < BUSINESS_COST) return { state, ok: false, error: 'Not enough cash to start a business.' };
  if (player.skillTokens < BUSINESS_SKILL_COST) return { state, ok: false, error: 'Not enough skill tokens.' };

  const income = randomInt(BUSINESS_INCOME_MIN, BUSINESS_INCOME_MAX);
  const name = pickBusinessName(player.businesses);
  // player.businessSeq (not businesses.length + 1 — see its comment in
  // players.js) so an id never gets reused after a business exit removes
  // one from the array; a game saved before businessSeq existed falls back
  // to businesses.length, which is still correct for a player who has
  // never had a business removed.
  const nextSeq = (player.businessSeq ?? player.businesses.length) + 1;
  const business = {
    id: `${playerId}-biz-${nextSeq}`,
    name,
    income,
    totalInvested: BUSINESS_COST, // grows with every upgrade bought — see businessValue() in players.js
    salesLevel: 0,
    opsLevel: 0,
    rndCount: 0,
    // Lifetime count of Marketing campaigns launched for this business —
    // measured against its earned allowance (see businessUpgrades.js's
    // marketingAllowance). Never decremented.
    marketingCount: 0,
    tempBoosts: [], // active Marketing boosts — [{ amount, expiresMonth }]
    pendingRnd: [], // in-flight R&D projects — [{ resolveMonth }]
    // Both feed the business-decline decay in game/businessUpgrades.js —
    // starting a business itself counts as "tending" it, so a brand-new
    // business gets the full grace period before neglect can start costing
    // it anything.
    startedMonth: state.month,
    lastTendedMonth: state.month,
  };

  const nextState = updatePlayer(state, playerId, (p) => ({
    ...p,
    cash: p.cash - BUSINESS_COST,
    skillTokens: p.skillTokens - BUSINESS_SKILL_COST,
    businesses: [...p.businesses, business],
    businessSeq: nextSeq,
    ledger: [...(p.ledger || []), { month: state.month, type: 'out', amount: BUSINESS_COST, source: `Started business: ${name}` }],
  }));

  return {
    state: nextState,
    ok: true,
    logEntry: { icon: '🚀', message: `started ${name} (+$${income}/mo)`, kind: 'business', playerId },
  };
}

/**
 * Invest in one of a business's four upgrade tracks — Marketing, Sales,
 * Operations, or R&D (see gameConfig.js's BUSINESS_UPGRADE_TRACKS and
 * game/businessUpgrades.js for what each one actually does). Validates
 * ownership, that the track hasn't already hit its cap for this business,
 * and that the player can afford the current cost (which shrinks with that
 * business's Operations level).
 */
export function upgradeBusiness(state, playerId, businessId, trackId) {
  const player = findPlayer(state, playerId);
  const track = BUSINESS_UPGRADE_TRACKS[trackId];
  if (!player || !track) return { state, ok: false, error: 'Invalid upgrade.' };

  const business = player.businesses.find((b) => b.id === businessId);
  if (!business) return { state, ok: false, error: 'Invalid business.' };
  // `state.month` matters for Marketing: it's what decides whether this
  // business's always-available monthly upkeep campaign is still on the
  // table (see businessUpgrades.js's marketingUpkeepAvailable).
  if (!canUpgradeTrack(business, trackId, state.month)) {
    return {
      state,
      ok: false,
      error: upgradeBlockReason(business, trackId, state.month) || `${track.name} is already maxed out for ${business.name}.`,
    };
  }

  const cost = upgradeCost(business, trackId);
  if (player.cash < cost) return { state, ok: false, error: `Not enough cash to invest in ${track.name}.` };

  const { business: nextBusiness, description } = applyUpgrade(business, trackId, state.month);

  const nextState = updatePlayer(state, playerId, (p) => ({
    ...p,
    cash: p.cash - cost,
    businesses: p.businesses.map((b) => (b.id === businessId ? nextBusiness : b)),
    ledger: [
      ...(p.ledger || []),
      { month: state.month, type: 'out', amount: cost, source: `Upgraded ${business.name}`, detail: track.name },
    ],
  }));

  return {
    state: nextState,
    ok: true,
    logEntry: { icon: track.icon, message: description, kind: 'businessUpgrade', playerId },
  };
}

export function learnSkill(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) return { state, ok: false, error: 'Invalid player.' };
  if (player.cash < SKILL_COST) return { state, ok: false, error: 'Not enough cash to learn a skill.' };

  const nextState = updatePlayer(state, playerId, (p) => ({
    ...p,
    cash: p.cash - SKILL_COST,
    skillTokens: p.skillTokens + 1,
    ledger: [...(p.ledger || []), { month: state.month, type: 'out', amount: SKILL_COST, source: 'Learned a skill' }],
  }));

  return {
    state: nextState,
    ok: true,
    logEntry: { icon: '📚', message: 'learned a new skill', kind: 'skill', playerId },
  };
}
