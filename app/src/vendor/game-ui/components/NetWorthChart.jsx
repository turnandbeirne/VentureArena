import { getBotPersonality } from '../../data/gameConfig';

// Colors for up to 3 human players — validated as a set with
// scripts/validate_palette.js (dataviz skill): all pairs pass the CVD/
// normal-vision/contrast checks. Bot players keep their existing
// personality color instead (gameConfig.js's BOT_PERSONALITIES) for
// consistency with the chat feed, where that color already carries their
// identity — a couple of those pre-existing bot colors are close enough to
// fail a strict pairwise CVD check on their own (a larger, separate fix
// than this chart), which is exactly why every line here is ALSO
// direct-labeled (avatar at the line's end, plus a legend row) rather than
// relying on color alone to tell players apart.
const HUMAN_COLORS = ['#1c7ed6', '#f08c00', '#9c36b5'];

function colorForPlayer(player, humanIndex) {
  if (player.type === 'ai') {
    return getBotPersonality(player.personalityId)?.color || '#5c5f66';
  }
  return HUMAN_COLORS[humanIndex % HUMAN_COLORS.length];
}

const WIDTH = 560;
const HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 34;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;

/**
 * A simple inline-SVG line chart of every player's net worth across the
 * months actually played so far — no charting library, consistent with the
 * rest of the app staying dependency-free. One axis (net worth over month);
 * see the color comment above for why bots keep their existing identity
 * color while humans get a small validated palette, and why every line is
 * also direct-labeled rather than relying on color alone.
 *
 * This is a static end-of-game recap rendered once, not a live dashboard —
 * deliberately skips a full interactive hover/crosshair layer.
 */
export default function NetWorthChart({ players }) {
  const withHistory = players.filter((p) => p.netWorthHistory && p.netWorthHistory.length > 0);
  if (withHistory.length === 0) return null;

  const maxMonth = Math.max(...withHistory.map((p) => p.netWorthHistory.length));
  const allValues = withHistory.flatMap((p) => p.netWorthHistory.map((h) => h.netWorth));
  const maxValue = Math.max(...allValues, 1);
  const minValue = Math.min(0, ...allValues);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  function xFor(month) {
    return PAD_LEFT + (maxMonth <= 1 ? 0 : ((month - 1) / (maxMonth - 1)) * plotWidth);
  }
  function yFor(value) {
    const range = maxValue - minValue || 1;
    return PAD_TOP + plotHeight - ((value - minValue) / range) * plotHeight;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = Math.round((minValue + (maxValue - minValue) * t) / 10) * 10;
    return { value, y: yFor(value) };
  });

  let humanIndex = 0;
  const series = withHistory.map((p) => {
    const color = colorForPlayer(p, p.type === 'human' ? humanIndex : -1);
    if (p.type === 'human') humanIndex += 1;
    const points = p.netWorthHistory.map((h) => ({ x: xFor(h.month), y: yFor(h.netWorth) }));
    const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const lastValue = p.netWorthHistory[p.netWorthHistory.length - 1].netWorth;
    return { id: p.id, name: p.name, avatar: p.avatar, color, path, last, lastValue };
  });

  return (
    <div className="vf-networth-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Net worth over time for each player">
        {gridLines.map((g) => (
          <g key={g.value}>
            <line x1={PAD_LEFT} y1={g.y} x2={WIDTH - PAD_RIGHT} y2={g.y} className="vf-networth-chart__grid" />
            <text x={PAD_LEFT - 8} y={g.y} className="vf-networth-chart__axis-label" textAnchor="end" dominantBaseline="middle">
              ${g.value.toLocaleString()}
            </text>
          </g>
        ))}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + plotHeight}
          x2={WIDTH - PAD_RIGHT}
          y2={PAD_TOP + plotHeight}
          className="vf-networth-chart__axis"
        />
        <text x={PAD_LEFT} y={HEIGHT - 6} className="vf-networth-chart__axis-label">
          Month 1
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 6} className="vf-networth-chart__axis-label" textAnchor="end">
          Month {maxMonth}
        </text>

        {series.map((s) => (
          <g key={s.id}>
            <path d={s.path} className="vf-networth-chart__line" style={{ stroke: s.color }} />
            <circle cx={s.last.x} cy={s.last.y} r={4} className="vf-networth-chart__marker" style={{ fill: s.color }} />
            <text x={s.last.x + 7} y={s.last.y} className="vf-networth-chart__end-label" dominantBaseline="middle">
              {s.avatar}
            </text>
          </g>
        ))}
      </svg>

      <div className="vf-networth-chart__legend">
        {series.map((s) => (
          <span key={s.id} className="vf-networth-chart__legend-item">
            <span className="vf-networth-chart__legend-swatch" style={{ background: s.color }} />
            {s.avatar} {s.name} — ${s.lastValue.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}
