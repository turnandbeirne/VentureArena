import { ACCESS_COPY } from '../lib/arena.js';

// One line that tells the member where they are on the access ladder and
// the single next step: guest → free account → verified email → full profile.
export default function AccessNotice({ access, isGuest, onNavigate }) {
  const level = isGuest ? 'anonymous' : access?.level;
  const copy = level ? ACCESS_COPY[level] : null;
  if (!copy) return null;
  return (
    <div className="va-notice">
      {copy}{' '}
      {level === 'anonymous' && <button className="arena-link-button" onClick={() => onNavigate('me')}>Create a free account</button>}
      {level === 'verified' && <button className="arena-link-button" onClick={() => onNavigate('me')}>Finish your profile ({access?.survey_score ?? 0}%)</button>}
    </div>
  );
}
