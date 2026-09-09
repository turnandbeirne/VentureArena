import { BRAND_CREDIT, BRAND_TAGLINE, PARENT_BRAND, VENTUREMAKER_URL } from '../../data/gameConfig';

/** VentureFlow wordmark + "A VentureMaker™ game" tagline + a cursive
 * "by Michael P Beirne" signature credit — used on every screen (setup,
 * board, game over). The whole mark links out to VentureMaker (opens in a
 * new tab so nobody loses their in-progress game). */
export default function Brand({ size = 'md', align = 'center' }) {
  return (
    <a
      href={VENTUREMAKER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`vf-brand vf-brand--link vf-brand--${size} vf-brand--${align}`}
      title={`Visit ${PARENT_BRAND}`}
    >
      <div className="vf-brand__logo">
        Venture<span>Flow</span>
      </div>
      <div className="vf-brand__tag">{BRAND_TAGLINE}</div>
      <div className="vf-brand__signature">{BRAND_CREDIT}</div>
    </a>
  );
}
