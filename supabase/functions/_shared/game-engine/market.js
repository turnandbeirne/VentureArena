// ============================================================================
// Market pricing engine
// ----------------------------------------------------------------------------
// Each month every asset's price drifts by the current weather's
// marketDrift, plus its own random volatility noise. Data-driven entirely
// off src/data/gameConfig.js — add a new asset there and it prices itself.
// ============================================================================
import { ASSETS, MIN_ASSET_PRICE } from '../data/gameConfig';
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
 */
export function driftPrices(prices, weatherState) {
  const stage = getStageInfo(weatherState);
  const nextPrices = { ...prices };
  const changePercent = {};

  for (const asset of ASSETS) {
    const current = prices[asset.id];
    const monthlyChange = stage.marketDrift + noise(asset.volatility);
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
