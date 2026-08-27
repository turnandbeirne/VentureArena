// Log entries whose numbers were just decided by a random roll (see
// game/businessUpgrades.js's percentOfIncome) get a brief "landing" flash
// instead of just flatly appearing — a cheap way to make the gamble feel
// like a gamble. Pure CSS (see game.css's .vf-log__entry--reveal), so it
// only ever plays once, exactly when the entry first mounts — a log entry
// never gets removed/re-added, so there's no risk of it replaying on an
// unrelated re-render.
const REVEAL_KINDS = new Set(['businessUpgrade', 'businessRnd']);

export default function EventLog({ log }) {
  const recent = [...log].slice(-40).reverse();
  return (
    <div>
      <div className="vf-section-title">
        <span>📜</span>
        <span>What's happened</span>
      </div>
      <div className="vf-card vf-log vf-scroll">
        {recent.length === 0 && <span className="vf-log__empty">The story of your months will show up here...</span>}
        {recent.map((entry) => (
          <div key={entry.id}>
            <div className={`vf-log__entry ${REVEAL_KINDS.has(entry.kind) ? 'vf-log__entry--reveal' : ''}`}>
              <span>{entry.icon}</span>
              <span>{entry.message}</span>
            </div>
            {/* A one-time "why" explainer for a handful of key moments — see
                game/lessons.js. Rendered as its own distinct callout so it
                reads as a bonus tidbit, not part of the log line itself. */}
            {entry.lesson && (
              <div className="vf-log__lesson">
                <span className="vf-log__lesson-icon">{entry.lesson.icon}</span>
                <span>
                  <strong>{entry.lesson.title}:</strong> {entry.lesson.blurb}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
