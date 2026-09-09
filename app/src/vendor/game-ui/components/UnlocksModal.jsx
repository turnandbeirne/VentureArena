import { playSound } from '../audio/soundEngine';

/** Read-only-ish viewer for cosmetic unlocks (extra avatars, board themes) —
 * shows what's unlocked, what's still locked, and what it takes to get
 * there (game/profile.js's lifetime totals). Also lets you switch your
 * active board theme among whatever you've unlocked so far. */
export default function UnlocksModal({ open, onClose, profile, avatarProgress, themeProgress, onSelectTheme }) {
  if (!open) return null;

  function handleClose() {
    playSound('click');
    onClose();
  }

  function handleSelectTheme(themeId) {
    playSound('click');
    onSelectTheme(themeId);
  }

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-unlocks" onClick={(e) => e.stopPropagation()}>
        <div className="vf-unlocks__header">
          <span>🏅 My Unlocks</span>
          <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
            Close
          </button>
        </div>

        <p className="vf-unlocks__stats">
          🎮 {profile.gamesPlayed} game{profile.gamesPlayed === 1 ? '' : 's'} played · 🏅 {profile.badgesEarned} badge
          {profile.badgesEarned === 1 ? '' : 's'} earned · 💰 Best net worth: ${profile.bestNetWorth.toLocaleString()}
        </p>

        <div className="vf-unlocks__section-title">Avatars</div>
        <div className="vf-unlocks__grid">
          {avatarProgress.map((item) => (
            <div key={item.avatar} className={`vf-unlocks__item ${item.unlocked ? '' : 'vf-unlocks__item--locked'}`}>
              <span className="vf-unlocks__item-icon">{item.unlocked ? item.avatar : '🔒'}</span>
              <span className="vf-unlocks__item-hint">{item.unlocked ? 'Unlocked!' : item.hint}</span>
            </div>
          ))}
        </div>

        <div className="vf-unlocks__section-title">Board Themes</div>
        <div className="vf-unlocks__grid">
          {themeProgress.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`vf-unlocks__item vf-unlocks__item--button ${theme.unlocked ? '' : 'vf-unlocks__item--locked'} ${
                profile.selectedTheme === theme.id ? 'vf-unlocks__item--active' : ''
              }`}
              disabled={!theme.unlocked}
              onClick={() => handleSelectTheme(theme.id)}
            >
              <span className="vf-unlocks__item-icon">{theme.unlocked ? theme.icon : '🔒'}</span>
              <span className="vf-unlocks__item-hint">{theme.unlocked ? theme.name : theme.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
