import { FINANCIAL_LESSONS, getScenario } from '../../data/gameConfig';
import { getBadgeInfo } from '../../game-engine/badges';
import { netWorth } from '../../game-engine/players';
import { buildInsights } from '../game/insights';
import { playSound } from '../audio/soundEngine';

const GENERIC_PROMPTS = [
  "What was the riskiest move you made this game — did it pay off?",
  "If you played again, would you buy the same things? Why or why not?",
  "What's one thing you'd do differently next time?",
];

/** A parent/teacher-facing summary of what happened and what got touched on
 * — meant to be read together after a game, or printed for a classroom.
 * Pulls from state that already exists (seenLessons, badges, final
 * standings) rather than tracking anything new. */
export default function FamilyRecapModal({ open, onClose, state, prices }) {
  if (!open) return null;

  const { players, seenLessons, scenarioId } = state;
  const scenario = getScenario(scenarioId);
  const concepts = (seenLessons || []).map((id) => FINANCIAL_LESSONS[id]).filter(Boolean);
  const ranked = [...players].sort((a, b) => netWorth(b, prices) - netWorth(a, prices));

  function handleClose() {
    playSound('click');
    onClose();
  }

  function handlePrint() {
    playSound('click');
    window.print();
  }

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-recap" onClick={(e) => e.stopPropagation()}>
        <div className="vf-recap__no-print">
          <div className="vf-recap__header">
            <span>📋 Family Recap</span>
            <div className="vf-recap__header-actions">
              <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handlePrint}>
                🖨️ Print
              </button>
              <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="vf-recap__content">
          <p className="vf-recap__scenario">
            {scenario.icon} Played as: <strong>{scenario.name}</strong>
          </p>

          <div className="vf-recap__section-title">💡 Concepts this game touched on</div>
          {concepts.length === 0 ? (
            <p className="vf-recap__empty">Nothing new came up this particular game — try another!</p>
          ) : (
            <ul className="vf-recap__list">
              {concepts.map((c) => (
                <li key={c.title}>
                  <strong>
                    {c.icon} {c.title}:
                  </strong>{' '}
                  {c.blurb}
                </li>
              ))}
            </ul>
          )}

          <div className="vf-recap__section-title">🏁 Final standings</div>
          <ul className="vf-recap__list">
            {ranked.map((p, i) => {
              // Only for human players — a robot's own portfolio patterns
              // aren't a useful drill-down for the family/classroom reading
              // this together. Same heuristic buildInsights already uses on
              // the game-over screen, just per-player here instead of only
              // for the winner.
              const playerInsights = p.type === 'human' ? buildInsights(p, prices) : [];
              return (
                <li key={p.id}>
                  #{i + 1} {p.avatar} {p.name} — ${netWorth(p, prices).toLocaleString()}
                  {p.badges.length > 0 && (
                    <span className="vf-recap__badges">
                      {' '}
                      · Badges: {p.badges.map((bid) => getBadgeInfo(bid)?.name).filter(Boolean).join(', ')}
                    </span>
                  )}
                  {playerInsights.length > 0 && (
                    <ul className="vf-recap__list" style={{ marginTop: '0.3rem' }}>
                      {playerInsights.map((insight) => (
                        <li key={insight.text} style={{ fontSize: '0.85rem', color: 'var(--vf-ink-soft)' }}>
                          {insight.icon} {insight.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="vf-recap__section-title">🗣️ Talk about it</div>
          <ul className="vf-recap__list">
            {GENERIC_PROMPTS.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
