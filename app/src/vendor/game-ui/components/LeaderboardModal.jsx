import { useEffect, useMemo, useState } from 'react';
import { getDifficulty } from '../../data/gameConfig';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useGlobalLeaderboard } from '../hooks/useGlobalLeaderboard';
import { playSound } from '../audio/soundEngine';
import { todayChallengeDate } from '../../game-engine/dailyChallenge';

const MODE_LABEL = { solo: '🤖 Solo', hotseat: '🪑 Hot-Seat' };

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/** "🥊 Hard Knocks" etc, or "—" for a score saved before difficulty presets
 * existed — deliberately NOT falling back to a default difficulty here,
 * since that would misrepresent what an old entry actually played on. */
function difficultyLabel(difficultyId) {
  if (!difficultyId) return '—';
  const d = getDifficulty(difficultyId);
  return `${d.icon} ${d.name}`;
}

/** Read-only breakdown of a leaderboard entry's frozen portfolio snapshot
 * (see game/players.js snapshotPortfolio) — how the win was built. Older
 * entries saved before this feature existed simply have no snapshot. */
function PortfolioSnapshot({ portfolio }) {
  if (!portfolio) {
    return <p className="vf-leaderboard__no-snapshot">No portfolio snapshot was saved for this run.</p>;
  }
  const totalBusinessIncome = portfolio.businesses.reduce((sum, b) => sum + b.income, 0);
  return (
    <div className="vf-leaderboard__snapshot">
      <div className="vf-portfolio__assets">
        {portfolio.assets.map((asset) =>
          asset.qty === 0 && asset.avgPurchasePrice === null ? (
            <div key={asset.id} className="vf-portfolio__asset-row vf-portfolio__asset-row--empty">
              <span className="vf-portfolio__asset-icon">{asset.icon}</span>
              <div>
                <div className="vf-portfolio__asset-name">{asset.name}</div>
                <div className="vf-portfolio__asset-detail">Never bought</div>
              </div>
              <span className="vf-portfolio__asset-value">—</span>
            </div>
          ) : (
            <div key={asset.id} className="vf-portfolio__asset-row">
              <span className="vf-portfolio__asset-icon">{asset.icon}</span>
              <div>
                <div className="vf-portfolio__asset-name">
                  {asset.name} · {asset.qty} owned
                </div>
                <div className="vf-portfolio__asset-detail">
                  Avg paid: {asset.avgPurchasePrice !== null ? `$${asset.avgPurchasePrice.toFixed(2)}` : '—'}
                </div>
              </div>
              <span className="vf-portfolio__asset-value">
                ${Math.round(asset.qty * asset.priceAtSave).toLocaleString()}
              </span>
            </div>
          )
        )}
      </div>
      <div className="vf-portfolio__section-title" style={{ marginTop: '0.6rem' }}>
        🚀 Businesses ({portfolio.businesses.length}) — ${totalBusinessIncome}/mo
      </div>
      {portfolio.businesses.length === 0 ? (
        <p className="vf-portfolio__empty">No businesses started.</p>
      ) : (
        <div className="vf-portfolio__businesses">
          {portfolio.businesses.map((biz) => (
            <div key={biz.id} className="vf-portfolio__business-row">
              <span>🚀 {biz.name || `Business #${biz.index}`}</span>
              <span className="vf-portfolio__business-income">+${biz.income}/mo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeaderboardModal({ open, onClose, highlightId }) {
  const { entries, refresh } = useLeaderboard();
  const [expandedId, setExpandedId] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) setExpandedId(null);
  }, [open]);

  const today = todayChallengeDate();
  // The shared board is only fetched once its tab is actually opened —
  // there's no reason to hit the network every time somebody glances at
  // their own local scores.
  const global = useGlobalLeaderboard({
    enabled: open && (tab === 'global' || tab === 'globalDaily'),
    dailyChallengeDate: tab === 'globalDaily' ? today : null,
  });
  const isGlobalTab = tab === 'global' || tab === 'globalDaily';
  // "Today's Challenge" is its own segment — every entry there played the
  // identical weather timeline/fortune-card draws (see
  // game/dailyChallenge.js), so those scores are a fair apples-to-apples
  // comparison in a way mixing them with regular runs wouldn't be.
  const visibleEntries = useMemo(() => {
    if (tab === 'global' || tab === 'globalDaily') return global.entries;
    if (tab === 'daily') return entries.filter((e) => e.dailyChallengeDate === today);
    return entries;
  }, [entries, global.entries, tab, today]);

  if (!open) return null;

  function handleClose() {
    playSound('click');
    onClose();
  }

  function toggleExpanded(id) {
    playSound('click');
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function selectTab(id) {
    playSound('click');
    setTab(id);
  }

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-leaderboard" onClick={(e) => e.stopPropagation()}>
        <div className="vf-leaderboard__header">
          <span>🏆 Leaderboard</span>
          <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="vf-leaderboard__tabs">
          <button
            type="button"
            className={`vf-btn vf-btn--sm ${tab === 'all' ? 'vf-btn--primary' : 'vf-btn--ghost'}`}
            onClick={() => selectTab('all')}
          >
            All-Time
          </button>
          <button
            type="button"
            className={`vf-btn vf-btn--sm ${tab === 'daily' ? 'vf-btn--primary' : 'vf-btn--ghost'}`}
            onClick={() => selectTab('daily')}
          >
            🗓️ Today's Challenge
          </button>
          {global.available && (
            <>
              <button
                type="button"
                className={`vf-btn vf-btn--sm ${tab === 'global' ? 'vf-btn--primary' : 'vf-btn--ghost'}`}
                onClick={() => selectTab('global')}
                title="Scores from everyone playing VentureFlow, on any device"
              >
                🌍 Global
              </button>
              <button
                type="button"
                className={`vf-btn vf-btn--sm ${tab === 'globalDaily' ? 'vf-btn--primary' : 'vf-btn--ghost'}`}
                onClick={() => selectTab('globalDaily')}
                title="Everyone who played today's challenge, anywhere"
              >
                🌍 Today
              </button>
            </>
          )}
        </div>

        {isGlobalTab && (
          <p className="vf-leaderboard__note">
            {global.loading
              ? 'Loading scores from everyone…'
              : global.error
              ? "Couldn't reach the global leaderboard — your own scores are safe on the other tabs."
              : 'Everyone who plays VentureFlow, on any device. Your local tabs keep working offline.'}
          </p>
        )}

        {visibleEntries.length === 0 ? (
          <p className="vf-log__empty">
            {global.loading && isGlobalTab
              ? ''
              : global.error && isGlobalTab
              ? 'Nothing to show while the global board is unreachable.'
              : tab === 'globalDaily'
              ? "No one anywhere has finished today's challenge yet — be the first!"
              : tab === 'global'
              ? 'No global scores yet — finish a game and add yours!'
              : tab === 'daily'
              ? "No one's played today's challenge yet — be the first!"
              : 'No scores saved yet — finish a game and add yours!'}
          </p>
        ) : (
          <div className="vf-leaderboard__list vf-scroll">
            {visibleEntries.map((entry, i) => (
              <div key={entry.id}>
                <button
                  type="button"
                  className={`vf-leaderboard__row ${entry.id === highlightId ? 'vf-leaderboard__row--highlight' : ''}`}
                  onClick={() => !entry.global && toggleExpanded(entry.id)}
                  title={entry.global ? 'A score from another player' : 'Tap to see their portfolio'}
                >
                  <span className="vf-leaderboard__rank">{i + 1}</span>
                  <span className="vf-leaderboard__avatar">{entry.avatar}</span>
                  <span className="vf-leaderboard__name">{entry.name}</span>
                  <span className="vf-leaderboard__mode">{MODE_LABEL[entry.mode] || entry.mode}</span>
                  <span className="vf-leaderboard__difficulty" title="Challenge level">
                    {difficultyLabel(entry.difficultyId)}
                  </span>
                  <span className="vf-leaderboard__date">{formatDate(entry.playedAt)}</span>
                  <span className="vf-leaderboard__score">${entry.netWorth.toLocaleString()}</span>
                </button>
                {!entry.global && expandedId === entry.id && <PortfolioSnapshot portfolio={entry.portfolio} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
