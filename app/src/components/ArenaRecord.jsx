import PersonaRadar from './PersonaRadar.jsx';
import { PERSONA_BLURBS, ordinal, timeAgo } from '../lib/arena.js';

// The member's Arena Record (blueprint §6.4): persona, ratings, badges and
// recent games. Used on "Me" and on any member's public page. `record` is
// the JSON from vm_arena_record().
export default function ArenaRecord({ record, colorHex }) {
  if (!record) return <p className="arena-muted">Loading record…</p>;
  const { persona, ratings = [], badges = [], recent = [], rank } = record;
  const games = ratings.reduce((n, r) => n + (r.games || 0), 0);
  const wins = ratings.reduce((n, r) => n + (r.wins || 0), 0);
  const best = ratings.reduce((m, r) => Math.max(m, r.rating || 0), 0) || 1200;

  return (
    <div className="va-record">
      <div className="va-stat-row">
        <div className="va-stat"><span className="va-stat-num">{rank}</span><span className="va-stat-label">Arena rank</span></div>
        <div className="va-stat"><span className="va-stat-num">{best}</span><span className="va-stat-label">rating</span></div>
        <div className="va-stat"><span className="va-stat-num">{wins}<span className="va-stat-dim">/{games}</span></span><span className="va-stat-label">wins / games</span></div>
      </div>

      <div className="va-record-grid">
        <section className="va-record-persona">
          <h3>{persona ? persona.label : 'Explorer'}</h3>
          <p className="arena-muted">
            {persona
              ? `${PERSONA_BLURBS[persona.label]} Based on ${persona.games_counted} game${persona.games_counted === 1 ? '' : 's'}.`
              : 'Play a game and the six style dimensions start filling in.'}
          </p>
          <PersonaRadar persona={persona} color={colorHex || '#1f6a4b'} />
        </section>

        <section>
          <h3>Badges</h3>
          {badges.length === 0 ? (
            <p className="arena-muted">No badges yet. Earn them at the table — passive income, businesses, balanced portfolios.</p>
          ) : (
            <div className="va-badges">
              {badges.map((b) => (
                <span className="va-badge-chip" key={b.id} title={b.name}>
                  <span aria-hidden="true">{b.icon}</span> {b.name}{b.count > 1 ? ` ×${b.count}` : ''}
                </span>
              ))}
            </div>
          )}
          <h3>Recent games</h3>
          {recent.length === 0 ? (
            <p className="arena-muted">No finished games yet.</p>
          ) : (
            <div className="va-history">
              {recent.map((g) => (
                <div className="va-history-row" key={g.room_id}>
                  <span className={`va-place place-${g.placement}`}>{ordinal(g.placement)}</span>
                  <span className="va-history-game">{g.game === 'ventureflow' ? 'VentureFlow' : g.game} · {g.players} players · ${Number(g.score).toLocaleString()}</span>
                  <span className={`va-delta ${g.delta >= 0 ? 'up' : 'down'}`}>{g.delta >= 0 ? '+' : ''}{g.delta}</span>
                  <span className="arena-muted">{timeAgo(g.finished_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
