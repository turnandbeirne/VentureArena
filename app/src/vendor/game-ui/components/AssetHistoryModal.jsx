import { useMemo } from 'react';
import { perUnitIncome } from '../../game-engine/players';
import { playSound } from '../audio/soundEngine';

const WIDTH = 480;
const HEIGHT = 150;
const PAD_LEFT = 54;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

// One color per METRIC (not per asset) — every asset's price chart is the
// same blue, every cashflow chart the same green, since the two charts in
// this modal are never compared against each other (different axes, see
// below) and only one asset is ever shown at a time, so there's no
// series-vs-series identity to encode with color.
const PRICE_COLOR = '#1c7ed6';
const CASHFLOW_COLOR = '#2f9e44';

/**
 * A small single-series inline-SVG line chart — mirrors NetWorthChart.jsx's
 * hand-rolled house style (no charting library) but plots ONE metric for
 * ONE asset across the months played so far. Per the dataviz skill: never a
 * dual-axis chart (price and cashflow are different scales, so they're two
 * of these, not one chart with two y-axes), and a single series needs no
 * legend box — the title above it names what's plotted.
 */
function MiniLineChart({ title, color, points, formatValue, formatAxis }) {
  if (!points || points.length === 0) return null;

  const months = points.map((p) => p.month);
  const minMonth = Math.min(...months);
  const maxMonth = Math.max(...months);
  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(0, ...values);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const monthSpan = maxMonth - minMonth;

  function xFor(month) {
    return PAD_LEFT + (monthSpan <= 0 ? plotWidth / 2 : ((month - minMonth) / monthSpan) * plotWidth);
  }
  function yFor(value) {
    const range = maxValue - minValue || 1;
    return PAD_TOP + plotHeight - ((value - minValue) / range) * plotHeight;
  }

  const gridLines = [0, 0.5, 1].map((t) => {
    const value = minValue + (maxValue - minValue) * t;
    return { value, y: yFor(value) };
  });

  const svgPoints = points.map((p) => ({ x: xFor(p.month), y: yFor(p.value) }));
  const path =
    svgPoints.length === 1
      ? null
      : svgPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const last = svgPoints[svgPoints.length - 1];
  const lastValue = values[values.length - 1];

  return (
    <div className="vf-mini-chart">
      <div className="vf-mini-chart__title">
        <span>{title}</span>
        <span className="vf-mini-chart__title-value" style={{ color }}>
          {formatValue(lastValue)}
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title} by month`}>
        {gridLines.map((g) => (
          <g key={g.value}>
            <line x1={PAD_LEFT} y1={g.y} x2={WIDTH - PAD_RIGHT} y2={g.y} className="vf-mini-chart__grid" />
            <text x={PAD_LEFT - 6} y={g.y} className="vf-mini-chart__axis-label" textAnchor="end" dominantBaseline="middle">
              {formatAxis(g.value)}
            </text>
          </g>
        ))}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + plotHeight}
          x2={WIDTH - PAD_RIGHT}
          y2={PAD_TOP + plotHeight}
          className="vf-mini-chart__axis"
        />
        <text x={PAD_LEFT} y={HEIGHT - 4} className="vf-mini-chart__axis-label">
          Month {minMonth}
        </text>
        {maxMonth !== minMonth && (
          <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} className="vf-mini-chart__axis-label" textAnchor="end">
            Month {maxMonth}
          </text>
        )}
        {path && <path d={path} className="vf-mini-chart__line" style={{ stroke: color }} />}
        <circle cx={last.x} cy={last.y} r={4} className="vf-mini-chart__marker" style={{ fill: color }} />
      </svg>
    </div>
  );
}

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
