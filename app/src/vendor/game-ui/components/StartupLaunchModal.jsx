import { useEffect } from 'react';
import { businessArt } from '../game/businessArt';
import { playSound } from '../audio/soundEngine';
import Fireworks from './Fireworks';

/**
 * The launch celebration for a business a HUMAN player just started —
 * "<Player>'s startup launches!", the business's name over an illustrated
 * storefront picked to match that name (see game/businessArt.js), what it
 * will pay every month from now on, and a burst of fireworks.
 *
 * Deliberately a full-stop modal rather than a toast: starting a business
 * is the single biggest decision in the game (it costs the most cash AND a
 * skill token), and it's the moment the "passive income" idea the whole
 * game is teaching becomes concrete — worth a beat of attention rather than
 * a line that scrolls past in the event log.
 *
 * Mounted only when state.pendingLaunch is set (reducer.js's START_BUSINESS)
 * and unmounted when it's acknowledged, so the fireworks re-randomize on
 * every launch — Fireworks builds its show once per mount.
 */
/** "Your", "Maya's", "Chris'" — the default player name is literally "You",
 * which would otherwise render as "You's startup launches!". Same handling
 * the turn banner in GameBoard.jsx already does. */
function possessive(name) {
  if (!name) return 'Your';
  if (name.trim().toLowerCase() === 'you') return 'Your';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

export default function StartupLaunchModal({ launch, onContinue }) {
  const art = businessArt(launch.businessName);
  const who = possessive(launch.playerName);

  // The fireworks + cheering layer, same pair the game-over fanfare uses.
  // Fired on mount rather than on the click that caused it, so it lands
  // with the visuals instead of a frame ahead of them.
  useEffect(() => {
    playSound('fireworks');
    playSound('cheering');
  }, []);

  function handleContinue() {
    playSound('click');
    onContinue();
  }

  return (
    <div className="vf-modal-overlay" onClick={handleContinue}>
      <div className="vf-card vf-launch" onClick={(e) => e.stopPropagation()}>
        <Fireworks />
        <div className="vf-launch__inner">
          <div className="vf-launch__eyebrow">
            {launch.avatar} {who} startup launches!
          </div>

          <div className="vf-launch__art" style={{ '--art-from': art.from, '--art-to': art.to }}>
            <span className="vf-launch__art-prop vf-launch__art-prop--left" aria-hidden="true">
              {art.props[0]}
            </span>
            <span className="vf-launch__art-hero" role="img" aria-label={launch.businessName}>
              {art.hero}
            </span>
            <span className="vf-launch__art-prop vf-launch__art-prop--right" aria-hidden="true">
              {art.props[1]}
            </span>
          </div>

          <h3 className="vf-launch__name">{launch.businessName}</h3>

          <div className="vf-launch__income">
            <span className="vf-launch__income-value">+${launch.income}</span>
            <span className="vf-launch__income-label">passive cash every month</span>
          </div>

          <p className="vf-launch__why">
            That's money it earns for you from now on, every single month, whether you're working on it or not — and
            reinvesting in it (Marketing, Sales, Operations, R&amp;D) grows the number.
          </p>

          <button type="button" className="vf-btn vf-btn--primary vf-btn--block" onClick={handleContinue}>
            Let's go! 🎉
          </button>
        </div>
      </div>
    </div>
  );
}
