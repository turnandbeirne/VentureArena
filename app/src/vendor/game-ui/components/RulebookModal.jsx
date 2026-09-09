import { useMemo, useState } from 'react';
import { buildRulebook } from '../data/rulebook';
import { playSound } from '../audio/soundEngine';

/** One rulebook block — a paragraph, a bulleted list, or a two-column
 * reference table. The rulebook itself is plain data (see data/rulebook.js),
 * so this renderer never needs to know what any rule actually says. */
function Block({ block }) {
  if (block.type === 'p') return <p className="vf-rulebook__p">{block.text}</p>;
  if (block.type === 'list') {
    return (
      <ul className="vf-rulebook__list">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === 'rows') {
    return (
      <div className="vf-rulebook__rows">
        {block.rows.map((row, i) => (
          <div key={i} className="vf-rulebook__row">
            <span className="vf-rulebook__row-label">{row.label}</span>
            <span className="vf-rulebook__row-detail">{row.detail}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * The full rules of the game, readable at any point without leaving it —
 * opened from the 📖 button beside the leaderboard on the board, and from
 * the setup screen before a game starts.
 *
 * Every number shown is pulled live from gameConfig.js via buildRulebook()
 * (see data/rulebook.js), and from the CURRENT game's difficulty/scenario
 * when there is one, so a player reading the rulebook mid-game sees the
 * figures actually in play rather than the defaults.
 */
export default function RulebookModal({ open, difficultyId, scenarioId, weatherSeverityId, turnTimer, onClose }) {
  const sections = useMemo(
    () => buildRulebook({ difficultyId, scenarioId, weatherSeverityId, turnTimer }),
    [difficultyId, scenarioId, weatherSeverityId, turnTimer]
  );
  const [activeId, setActiveId] = useState(sections[0].id);

  if (!open) return null;

  const active = sections.find((s) => s.id === activeId) || sections[0];

  function handleClose() {
    playSound('click');
    onClose();
  }

  function selectSection(id) {
    playSound('click');
    setActiveId(id);
  }

  return (
    <div className="vf-modal-overlay" onClick={handleClose}>
      <div className="vf-card vf-rulebook" onClick={(e) => e.stopPropagation()}>
        <div className="vf-rulebook__header">
          <span className="vf-rulebook__title">📖 Rulebook</span>
          <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="vf-rulebook__tabs">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`vf-rulebook__tab ${section.id === active.id ? 'vf-rulebook__tab--active' : ''}`}
              onClick={() => selectSection(section.id)}
            >
              <span aria-hidden="true">{section.icon}</span> {section.title}
            </button>
          ))}
        </div>

        <div className="vf-rulebook__body vf-scroll">
          <h3 className="vf-rulebook__section-title">
            {active.icon} {active.title}
          </h3>
          {active.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}
