// The site masthead: a gears+coin logo mark, the "VentureArena" wordmark,
// and a cursive tagline underneath — all one link back to venturemaker.org,
// per the brief ("logo/title and header should link back to venturemaker.org").
// Rendered above every screen (see App.jsx) so it's consistent everywhere,
// including the signed-out auth screen.

const GEAR_TEETH = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);

function GearCoinMark() {
  return (
    <svg className="arena-brand-mark" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
      <g fill="#2f6f4f">
        {GEAR_TEETH.map((deg) => (
          <rect key={deg} x="29" y="6" width="6" height="9" rx="1.5" transform={`rotate(${deg} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="15" />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="#f6f5f2" />
      <g transform="translate(20 20)">
        <circle cx="18" cy="18" r="13" fill="#e0b23c" stroke="#a97a1f" strokeWidth="1.5" />
        <text x="18" y="23" textAnchor="middle" fontSize="15" fontWeight="700" fill="#a97a1f" fontFamily="system-ui, sans-serif">
          $
        </text>
      </g>
    </svg>
  );
}

export default function Brand() {
  return (
    <a className="arena-brand" href="https://venturemaker.org" target="_blank" rel="noreferrer">
      <div className="arena-brand-row">
        <GearCoinMark />
        <div className="arena-brand-text">
          <span className="arena-brand-name">VentureArena</span>
          <span className="arena-brand-subtitle">A VentureMaker game space</span>
        </div>
      </div>
      <div className="arena-brand-tagline">VentureArena — where competition means business</div>
    </a>
  );
}
