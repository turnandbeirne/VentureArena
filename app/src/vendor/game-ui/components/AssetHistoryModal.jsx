import { useMemo } from 'react';
import { perUnitIncome } from '../../game-engine/players';
import { playSound } from '../audio/soundEngine';
import MiniLineChart from './MiniLineChart';

// One color per METRIC (not per asset) — every asset's price chart is the
// same blue, every cashflow chart the same green, since the two charts in
// this modal are never compared against each other (different axes, see
// below) and only one asset is ever shown at a time, so there's no
// series-vs-series identity to encode with color.
const PRICE_COLOR = '#1c7ed6';
const CASHFLOW_COLOR = '#2f9e44';

/**
 * "Click any asset to see its history" — a per-asset price + cashflow
 * chart, opened from AssetShop.jsx. `history` is gameState.assetHistory[assetId]
 * (turnEngine.js's finishMonthEnd appends one {month, price, cashflow}
 * snapshot per asset per COMPLETED month, same one-point-per-finished-month
 * convention as player.netWorthHistory — so a brand new room with no
 * completed months yet has no history, handled below). The live in-progress
 * month's price/cashflow (from the current game state, not yet in history)
 * is appended as the chart's latest point so the chart is never a month
 * behind what's on screen.
 */
export default function AssetHistoryModal({ asset, history, currentMonth, currentPrice, totalOwned, weatherIncomeAmounts, onClose }) {
  if (!asset) return null;

  const currentCashflow = useMemo(
    () => perUnitIncome(asset, { price: currentPrice, totalOwned, weatherIncomeAmounts }),
    [asset, currentPrice, totalOwned, weatherIncomeAmounts]
  );

  const pricePoints = useMemo(() => {
    const base = (history || []).map((h) => ({ month: h.month, value: h.price }));
    if (currentPrice != null && (base.length === 0 || base[base.length - 1].month < currentMonth)) {
      base.push({ month: currentMonth, value: currentPrice });
    }
    return base;
  }, [history, currentMonth, currentPrice]);

  const cashflowPoints = useMemo(() => {
    const base = (history || []).map((h) => ({ month: h.month, value: h.cashflow }));
    if (currentPrice != null && (base.length === 0 || base[base.length - 1].month < currentMonth)) {
      base.push({ month: currentMonth, value: currentCashflow });
    }
    return base;
  }, [history, currentMonth, currentPrice, currentCashflow]);

  const hasEnoughHistory = pricePoints.length > 0;

  function handleClose() {
    playSound('click');
    onClose();
  }

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-asset-history" onClick={(e) => e.stopPropagation()}>
        <div className="vf-asset-history__header">
          <span className="vf-asset-history__title">
            {asset.icon} {asset.name} — history
          </span>
          <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
            ✕
          </button>
        </div>
        <p className="vf-asset-history__tagline">{asset.tagline}</p>

        {hasEnoughHistory ? (
          <>
            <MiniLineChart
              title="💵 Price"
              color={PRICE_COLOR}
              points={pricePoints}
              formatValue={(v) => `$${Math.round(v).toLocaleString()}`}
              formatAxis={(v) => `$${Math.round(v).toLocaleString()}`}
            />
            <MiniLineChart
              title="📈 Cashflow (per unit / month)"
              color={CASHFLOW_COLOR}
              points={cashflowPoints}
              formatValue={(v) => `$${v.toFixed(2)}`}
              formatAxis={(v) => `$${v.toFixed(2)}`}
            />
          </>
        ) : (
          <p className="vf-asset-history__empty">
            History builds up one month at a time — check back after month 1 wraps up.
          </p>
        )}
      </div>
    </div>
  );
}
