// ============================================================================
// Market pricing engine
// ----------------------------------------------------------------------------
// Each month every asset's price drifts by the current weather's
// marketDrift, plus its own random volatility noise. Data-driven entirely
// off src/data/gameConfig.js — add a new asset there and it prices itself.
// ============================================================================
import { ASSETS, MIN_ASSET_PRICE, severityScaled } from '../data/gameConfig';
// Environment stream — see game/rng.js's module comment and weather.js for
// why price drift can't share a stream with anything player-choice-driven.
import { envNoise as noise } from './rng';
import { getStageInfo } from './weather';

export function createInitialPrices() {
  const prices = {};
  for (const asset of ASSETS) prices[asset.id] = asset.basePrice;
  return prices;
}

/**
 * Advance every asset price by one month using the current weather.
 * Returns a new prices object plus a per-asset % change map (handy for
 * showing "up"/"down" arrows in the UI).
 *
 * `weatherSeverityId` (see gameConfig.js's WEATHER_SEVERITIES) scales BOTH
 * halves of the move: the weather's directional drift and the asset's own
 * random swing. Scaling only the drift would make a "severe" economy
 * relentlessly one-directional rather than genuinely volatile.
 *
 * The noise draw happens unconditionally, once per asset, in fixed order,
 * regardless of severity — the environment stream's draw count must never
 * depend on a setting or a choice (see game/rng.js).
 */
export function driftPrices(prices, weatherState, weatherSeverityId) {
  const stage = getStageInfo(weatherState);
  const nextPrices = { ...prices };
  const changePercent = {};

  for (const asset of ASSETS) {
    const current = prices[asset.id];
    const drift = severityScaled(stage.marketDrift, weatherSeverityId);
    const swing = severityScaled(noise(asset.volatility), weatherSeverityId);
    const monthlyChange = drift + swing;
    const next = Math.max(MIN_ASSET_PRICE, current * (1 + monthlyChange));
    nextPrices[asset.id] = Math.round(next * 100) / 100;
    changePercent[asset.id] = monthlyChange;
  }

  return { prices: nextPrices, changePercent };
}

/** Apply a one-off % bump to a single asset (or 'all') — used by fortune cards. */
export function bumpPrice(prices, assetId, percent) {
  const nextPrices = { ...prices };
  const ids = assetId === 'all' ? ASSETS.map((a) => a.id) : [assetId];
  for (const id of ids) {
    const current = nextPrices[id];
    nextPrices[id] = Math.round(Math.max(MIN_ASSET_PRICE, current * (1 + percent / 100)) * 100) / 100;
  }
  return nextPrices;
}

export function getAssetConfig(assetId) {
  return ASSETS.find((a) => a.id === assetId);
}
