import { useEffect, useState } from 'react';
import { fetchProfiles, requestFriend, roomResults, sendChallenge, ordinal, PERSONA_BLURBS } from '../../lib/arena.js';
import { fetchSeats } from '../../lib/rooms.js';
import Avatar from '../../components/Avatar.jsx';

// The result card (blueprint §3.1): placement, rating change, a persona
// insight, and one-tap Rematch / Connect. Results are written server-side
// when the room finishes (recordArenaResults), so this polls briefly until
// the row for this member exists.
export default function ArenaResultCard({ room, session, onLeave }) {
  const me = session.user.id;
  const [mine, setMine] = useState(null);
  const [tablemates, setTablemates] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let tries = 0;
    let timer;
    async function load() {
      try {
        const [rows, seats] = await Promise.all([roomResults(room.id), fetchSeats(room.id)]);
        const my = rows.find((r) => r.user_id === me) || null;
        setMine(my);
        const others = seats.filter((s) => s.user_id && s.user_id !== me).map((s) => s.user_id);
        setTablemates(others);
        setProfiles(await fetchProfiles(others));
        if (!my && tries++ < 6) timer = setTimeout(load, 1500);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
    return () => clearTimeout(timer);
  }, [room.id, me]);

  async function act(fn, msg) {
    setError(null);
    try {
      await fn();
      setToast(msg);
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  if (session.user.is_anonymous && !mine) return null;
  const delta = mine ? mine.rating_after - mine.rating_before : null;
  const sig = mine?.signals || {};
  const insight = insightFor(sig);

  return (
    <div className="va-result-card">
      <div className="va-result-head">
        <span className="va-eyebrow">Arena result</span>
        {mine ? (
          <h3>{ordinal(mine.placement)} of {mine.player_count} · rating {mine.rating_after} <span className={`va-delta ${delta >= 0 ? 'up' : 'down'}`}>({delta >= 0 ? '+' : ''}{delta})</span></h3>
        ) : (
          <h3>Recording your result…</h3>
        )}
      </div>
      {insight && <p className="va-result-insight">{insight}</p>}
      {error && <div className="arena-error">{error}</div>}
      {toast && <div className="va-toast">{toast}</div>}
      {tablemates.length > 0 && (
        <div className="va-result-people">
          {tablemates.map((id) => (
            <div className="va-person-card" key={id}>
              <div className="va-person-main">
                <Avatar profile={profiles[id]} size={36} />
                <div className="va-person-name">{profiles[id]?.display_name || 'Player'}</div>
              </div>
              <div className="va-person-actions">
                <button className="arena-button primary arena-button-inline" onClick={() => act(() => sendChallenge(id, 'ventureflow', 'Rematch?'), 'Rematch challenge sent')}>Rematch</button>
                {!session.user.is_anonymous && !profiles[id]?.is_guest && (
                  <button className="arena-button secondary arena-button-inline" onClick={() => act(() => requestFriend(id), 'Friend request sent')}>Connect</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="arena-button secondary" onClick={onLeave}>Back to the Arena</button>
    </div>
  );
}

function insightFor(sig) {
  if (!sig || Object.keys(sig).length === 0) return null;
  if (sig.negotiation >= 65) return `You turned down ${sig.raw?.offersDeclined ?? 'the'} buyout offer${(sig.raw?.offersDeclined ?? 2) === 1 ? '' : 's'} and kept building — classic Dealmaker.`;
  if (sig.risk >= 65) return 'Most of your money went into high-volatility assets and businesses. Bold — a Wildcard table.';
  if (sig.horizon >= 60) return 'You spent on businesses and skills over quick assets: a long-horizon game.';
  if (sig.resilience >= 68) return 'You were behind at the midpoint and finished stronger. That is a Closer\'s game.';
  if (sig.risk <= 40 && sig.speed <= 55) return 'Steady, low-variance, deliberate turns — an Operator\'s game.';
  if (sig.speed >= 75) return 'Fast turns all game. Speed is a style; watch it doesn\'t become a habit under pressure.';
  return PERSONA_BLURBS.Explorer;
}
