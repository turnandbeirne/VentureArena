const WIDTH = 480;
const HEIGHT = 150;
const PAD_LEFT = 54;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

/**
 * A small single-series inline-SVG line chart — mirrors NetWorthChart.jsx's
 * hand-rolled house style (no charting library) but plots ONE metric across
 * the months played so far. Per the dataviz skill: never a dual-axis chart —
 * two measures of different scale get two of these, not one chart with two
 * y-axes — and a single series needs no legend box, so the title above it
 * names what's plotted. Shared by AssetHistoryModal.jsx (one asset's price
 * or cashflow) and GameEndingRecap.jsx (one player's net worth, passive
 * income, or total earnings), both in this same game-ui/components/
 * directory.
 */
export default function MiniLineChart({ title, color, points, formatValue, formatAxis }) {
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
