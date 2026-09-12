// Paid-plan features (lessons, matchmaking+, prizes, classes, pitch reviews,
// coaching, recruiting, consulting) shown with lock state so the upgrade
// path is visible from Home without nagging.
const ITEMS = [
  ['lessons', '📚', 'Lessons'], ['classes', '🎓', 'Classes'], ['prizes', '🏆', 'Prizes'], ['matchmaking_plus', '🤝', 'Matchmaking+'],
  ['pitch_reviews', '🎤', 'Pitch reviews'], ['recruiting', '🧲', 'Recruiting'], ['coaching', '🧭', 'Coaching'], ['consulting', '💼', 'Consulting'],
];

export default function PaidFeatures({ access, onNavigate }) {
  const paid = access?.paid_features ?? {};
  const unlocked = ITEMS.filter(([k]) => paid[k]).length;
  return (
    <div>
      <div className="arena-panel-header">
        <h2>Member programs</h2>
        <button className="arena-button secondary arena-button-inline" onClick={() => onNavigate('tiers')}>{unlocked ? 'Manage plan' : 'See plans'}</button>
      </div>
      <div className="va-feature-strip">
        {ITEMS.map(([k, icon, label]) => (
          <button key={k} type="button" className={`va-feature-chip ${paid[k] ? 'on' : ''}`} onClick={() => onNavigate('tiers')} title={paid[k] ? 'Included in your plan' : 'Paid plans'}>
            <span aria-hidden="true">{icon}</span>{label}{!paid[k] && <span className="va-lock" aria-label="locked">🔒</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
