// Five-tab navigation (blueprint §3.2): bottom bar on phones, top strip on
// wider screens — same markup, CSS decides.
const TABS = [
  ['home', 'Home', '🏟️'],
  ['play', 'Play', '🎲'],
  ['people', 'People', '🤝'],
  ['tiers', 'Membership', '⭐'],
  ['me', 'Me', '👤'],
];

export default function NavBar({ current, onNavigate, badges = {} }) {
  return (
    <nav className="va-nav" aria-label="Main">
      {TABS.map(([key, label, icon]) => (
        <button
          key={key}
          type="button"
          className={`va-nav-item ${current === key ? 'active' : ''}`}
          onClick={() => onNavigate(key)}
          aria-current={current === key ? 'page' : undefined}
        >
          <span className="va-nav-icon" aria-hidden="true">{icon}</span>
          <span className="va-nav-label">{label}</span>
          {badges[key] > 0 && <span className="va-nav-badge">{badges[key]}</span>}
        </button>
      ))}
    </nav>
  );
}
