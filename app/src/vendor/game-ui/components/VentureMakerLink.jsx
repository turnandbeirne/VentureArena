import { VENTUREMAKER_URL, VENTUREMAKER_BLURB, PARENT_BRAND } from '../../data/gameConfig';

/**
 * The shared "learn more about entrepreneurship / connect with VentureMaker"
 * callout — rendered at the bottom of the setup screen and on the game-over
 * screen (see SetupScreen.jsx / GameOverScreen.jsx). Deliberately its own
 * small component rather than copy-pasted markup so the wording and link
 * only ever live in one place.
 */
export default function VentureMakerLink({ className = '' }) {
  return (
    <a
      href={VENTUREMAKER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`vf-venturemaker-link ${className}`.trim()}
      title={`Visit ${PARENT_BRAND}`}
    >
      🚀 {VENTUREMAKER_BLURB}
    </a>
  );
}
