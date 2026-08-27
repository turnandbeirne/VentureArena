import { useState } from 'react';
import { playSound } from '../audio/soundEngine';
import MiniLineChart from './MiniLineChart';
import LessonTip from './LessonTip';

// One color per METRIC, not per player — this panel only ever shows ONE
// player's numbers at a time (whoever's selected above), so there's no
// player-vs-player identity to encode with color here; that's what
// NetWorthChart.jsx on the actual leaderboard screen is for. Per the
// dataviz skill, net worth / passive cash flow / earnings are three
// different scales, so they're three single-series charts, never one
// chart with stacked axes.
const NET_WORTH_COLOR = '#1c7ed6';
const PASSIVE_COLOR = '#2f9e44';
const EARNINGS_COLOR = '#f08c00';

const money = (v) => `$${Math.round(v).toLocaleString()}`;

/**
 * One entry from a player's fortuneCardHistory (game-engine/turnEngine.js
 * appends one per card ever drawn, permanently — unlike
 * gameState.fortuneRecap, which is cleared every month once that month's
 * cards are viewed, so this is the only place a card is still findable
 * once the game is over). Deliberately a compact list row, not the full
 * FortuneCardModal — this can be a long list across a whole game, and the
 * modal's per-card pop-in ceremony doesn't scale to "show me all of them
 * at once".
 */
function FortuneCardRow({ entry }) {
  const good = entry.deckId === 'opportunity';
  return (
    <div className={`vf-ending-card ${good ? 'vf-ending-card--good' : 'vf-ending-card--bad'}`}>
      <div className="vf-ending-card__top">
        <span className="vf-ending-card__icon">{entry.card.icon}</span>
        <span className="vf-ending-card__title">{entry.card.title}</span>
        <span className="vf-ending-card__month">Month {entry.month}</span>
      </div>
      <p className="vf-ending-card__flavor">{entry.card.flavor}</p>
      <div className={`vf-ending-card__effect ${good ? 'vf-ending-card__effect--good' : 'vf-ending-card__effect--bad'}`}>
        {entry.description}
      </div>
      <div className="vf-ending-card__why">
        <strong>Why?</strong>
        {entry.card.why}
        <LessonTip conceptId={good ? 'opportunity' : 'emergencyFund'} />
      </div>
    </div>
  );
}

/**
 * The 'gameEnding' screen — a browsable recap of the whole room's game that
 * just finished, replacing what used to be a plain "tallying up the
 * results..." countdown. Pick any player at the table — including
 * opponents, not just yourself — to see every fortune card they ever drew
 * (each with the same "learn more" LessonTip as the in-game popup) plus
 * their net worth, passive cash flow, and earnings across every completed
 * month. No auto-advance: this is meant to be read at whatever pace each
 * viewer wants, so it waits for a deliberate "Continue to Leaderboard"
 * click (see turnEngine.js's finalizeGameOver) rather than racing a timer —
 * every connected client renders this same recap independently and reads
 * it at their own pace; nobody is stuck waiting on anyone else here, unlike
 * the fortune-card recap earlier in the game.
 */
export default function GameEndingRecap({ players, defaultPlayerId, onContinue }) {
  const [selectedId, setSelectedId] = useState(defaultPlayerId || players[0]?.id);
  const selected = players.find((p) => p.id === selectedId) || players[0];

  function selectPlayer(id) {
    if (id === selectedId) return;
    playSound('click');
    setSelectedId(id);
  }

  function handleContinue() {
    playSound('click');
    onContinue();
  }

  if (!selected) return null;

  const netWorthPoints = (selected.netWorthHistory || []).map((h) => ({ month: h.month, value: h.netWorth }));
  const passivePoints = (selected.passiveIncomeHistory || []).map((h) => ({ month: h.month, value: h.passiveIncome }));
  const earningsPoints = (selected.totalIncomeHistory || []).map((h) => ({ month: h.month, value: h.income }));
  const cards = selected.fortuneCardHistory || [];

  return (
    <div className="vf-modal-overlay">
      <div className="vf-card vf-ending-recap">
        <div className="vf-ending-recap__header">
          <div className="vf-ending-recap__title">
            <span className="vf-ending-recap__icon">🏁</span>
            <div>
              <h2>That's a wrap!</h2>
              <p className="vf-ending-recap__hint">Browse how everyone's game played out, then head to the leaderboard.</p>
            </div>
          </div>
          <button type="button" className="vf-btn vf-btn--go" onClick={handleContinue}>
            Continue to Leaderboard →
          </button>
        </div>

        <div className="vf-ending-recap__players">
          {players.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`vf-ending-recap__player-chip ${p.id === selectedId ? 'vf-ending-recap__player-chip--active' : ''}`}
              onClick={() => selectPlayer(p.id)}
            >
              <span>{p.avatar}</span>
              <span>{p.name}</span>
              {p.type === 'ai' && <span title="AI player">🤖</span>}
            </button>
          ))}
        </div>

        <div className="vf-ending-recap__body">
          <div className="vf-ending-recap__charts">
            <MiniLineChart title="💰 Net Worth" color={NET_WORTH_COLOR} points={netWorthPoints} formatValue={money} formatAxis={money} />
            <MiniLineChart
              title="🌱 Passive Cash Flow"
              color={PASSIVE_COLOR}
              points={passivePoints}
              formatValue={(v) => `${money(v)}/mo`}
              formatAxis={money}
            />
            <MiniLineChart title="💵 Monthly Earnings" color={EARNINGS_COLOR} points={earningsPoints} formatValue={money} formatAxis={money} />
          </div>

          <div className="vf-ending-recap__cards">
            <div className="vf-ending-recap__cards-title">
              🎴 {selected.name}'s fortune cards ({cards.length})
            </div>
            {cards.length > 0 ? (
              <div className="vf-ending-recap__card-list">
                {cards.map((entry, i) => (
                  <FortuneCardRow key={`${entry.month}-${i}`} entry={entry} />
                ))}
              </div>
            ) : (
              <p className="vf-ending-recap__cards-empty">No fortune cards landed on {selected.name} this game.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
