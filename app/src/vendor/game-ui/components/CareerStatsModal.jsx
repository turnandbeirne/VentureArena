import { playSound } from '../audio/soundEngine';

/**
 * Lifetime "career" totals — separate from game/profile.js's best-ever
 * figures (which only move on a new personal best): these accumulate every
 * game played, win or lose, so there's a reason to keep coming back even
 * between one-off games with different people. Read-only; opened from the
 * setup screen next to Unlocks/Leaderboard.
 */
export default function CareerStatsModal({ open, onClose, profile }) {
  if (!open) return null;

  function handleClose() {
    playSound('click');
    onClose();
  }

  const stats = [
    { icon: '🎮', label: 'Games played', value: (profile.gamesPlayed || 0).toLocaleString() },
    { icon: '💰', label: 'Career net worth earned', value: `$${(profile.totalNetWorthEarned || 0).toLocaleString()}` },
    { icon: '🏆', label: 'Best single-game net worth', value: `$${(profile.bestNetWorth || 0).toLocaleString()}` },
    { icon: '🌱', label: 'Best passive income (any single game)', value: `$${(profile.bestPassiveIncome || 0).toLocaleString()}/mo` },
    { icon: '🚀', label: 'Businesses started', value: (profile.totalBusinessesStarted || 0).toLocaleString() },
    { icon: '💼', label: 'Businesses sold in a buyout', value: (profile.totalBusinessesSold || 0).toLocaleString() },
    { icon: '🏅', label: 'Badges earned', value: (profile.badgesEarned || 0).toLocaleString() },
  ];

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-unlocks" onClick={(e) => e.stopPropagation()}>
        <div className="vf-unlocks__header">
          <span>📊 My Career Stats</span>
          <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
            Close
          </button>
        </div>

        <p className="vf-unlocks__stats">Every game you've ever played on this device, added up.</p>

        <div className="vf-career-stats__grid">
          {stats.map((stat) => (
            <div key={stat.label} className="vf-career-stats__item">
              <span className="vf-career-stats__icon">{stat.icon}</span>
              <span className="vf-career-stats__value">{stat.value}</span>
              <span className="vf-career-stats__label">{stat.label}</span>
            </div>
          ))}
        </div>

        {profile.gamesPlayed === 0 && (
          <p className="vf-unlocks__stats">Play your first game to start building your career stats!</p>
        )}
      </div>
    </div>
  );
}
