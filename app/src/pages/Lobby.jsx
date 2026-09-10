import { useEffect, useState } from 'react';
import { createRoom, getVentureflowGameId, listMyRooms, listOpenRooms, fetchSeats } from '../lib/rooms.js';
import { listGames } from '../lib/arena.js';

const MIN_SEATS = 2;
const MAX_SEATS = 5;

// Play (blueprint §10): the game catalog first — live games, Lab/coming-soon
// games, and linked partner games — then tables: create one, join by code,
// rejoin yours, or browse open ones.
function RoomRow({ room, seatSummary, onOpen }) {
  return (
    <button className="arena-list-row" onClick={() => onOpen(room.invite_code)}>
      <div>
        <div className="arena-list-row-title">
          {room.name || `Table ${room.invite_code}`} <span className={`arena-badge status-${room.status}`}>{room.status === 'open' ? 'seating' : room.status === 'active' ? 'in play' : room.status}</span>
        </div>
        <div className="arena-list-row-sub">
          {seatSummary} · {new Date(room.created_at).toLocaleDateString()}
        </div>
      </div>
      <span className="arena-list-row-arrow">→</span>
    </button>
  );
}

function GameCard({ game, onPlay }) {
  const status = game.status;
  return (
    <div className={`va-game-card status-${status}`}>
      <div className="va-game-icon" aria-hidden="true">{game.icon || '🎲'}</div>
      <div className="va-game-body">
        <div className="va-game-name">
          {game.name}
          {status === 'live' && <span className="arena-badge status-active">live</span>}
          {status === 'coming_soon' && <span className="arena-badge status-open">Labs · coming soon</span>}
          {status === 'external_link' && <span className="arena-badge status-finished">partner</span>}
        </div>
        <div className="arena-muted">{game.description}{game.min_seats ? ` · ${game.min_seats}–${game.max_seats} players` : ''}</div>
      </div>
      {status === 'live' && <button className="arena-button primary arena-button-inline" onClick={onPlay}>Play</button>}
      {status === 'external_link' && game.external_url && (
        <a className="arena-button secondary arena-button-inline va-link-button" href={game.external_url} target="_blank" rel="noreferrer">Open ↗</a>
      )}
    </div>
  );
}

export default function Lobby({ session, onOpenRoom }) {
  const [games, setGames] = useState([]);
  const [myRooms, setMyRooms] = useState(null);
  const [openRooms, setOpenRooms] = useState(null);
  const [seatCounts, setSeatCounts] = useState({}); // roomId -> "2/4 seats"
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [seatCount, setSeatCount] = useState(3);
  // For seats 1..N-1 (seat 0 is always the host): 'ai' | 'open'
  const [seatPlan, setSeatPlan] = useState(['ai', 'open']);
  const [roomName, setRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState('');

  async function refresh() {
    setError(null);
    try {
      const [mine, open, catalog] = await Promise.all([listMyRooms(session.user.id), listOpenRooms(), listGames()]);
      setMyRooms(mine.filter((r) => r.status !== 'finished').slice(0, 12));
      setOpenRooms(open);
      setGames(catalog);
      const allRooms = [...mine, ...open];
      const counts = {};
      await Promise.all(
        allRooms.map(async (r) => {
          if (counts[r.id]) return;
          const seats = await fetchSeats(r.id);
          const filled = seats.filter((s) => s.user_id || s.bot_personality_id).length;
          counts[r.id] = `${filled}/${seats.length} seats filled`;
        }),
      );
      setSeatCounts(counts);
    } catch (err) {
      setError(err.message || 'Could not load tables');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSeatCount(next) {
    const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, next));
    setSeatCount(n);
    setSeatPlan((prev) => {
      const copy = prev.slice(0, n - 1);
      while (copy.length < n - 1) copy.push('open');
      return copy;
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const gameId = await getVentureflowGameId();
      const room = await createRoom({ hostId: session.user.id, gameId, seatPlan, name: roomName.trim() || null });
      onOpenRoom(room.invite_code);
    } catch (err) {
      setError(err.message || 'Could not create table');
    } finally {
      setCreating(false);
    }
  }

  function handleJoinByCode(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onOpenRoom(joinCode.trim());
  }

  const liveGames = games.filter((g) => g.status === 'live');
  const labGames = games.filter((g) => g.status === 'coming_soon');
  const partnerGames = games.filter((g) => g.status === 'external_link');

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <div>
          <h1>Play</h1>
          <p className="subtitle">Pick a game, open a table, invite anyone with a link.</p>
        </div>
      </div>

      {error && <div className="arena-error">{error}</div>}

      <div className="arena-panel">
        <h2>Games</h2>
        <div className="va-game-list">
          {liveGames.map((g) => <GameCard key={g.id} game={g} onPlay={() => setShowCreate(true)} />)}
          {labGames.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
        {partnerGames.length > 0 && (
          <>
            <h3 className="va-subhead">Partner games</h3>
            <p className="arena-muted">Favorites from around the web. Play there, then log the result here from your Arena Record (coming with Labs).</p>
            <div className="va-game-list">
              {partnerGames.map((g) => <GameCard key={g.id} game={g} />)}
            </div>
          </>
        )}
      </div>

      <div className="arena-panel" id="create-table">
        <div className="arena-panel-header">
          <h2>Open a VentureFlow table</h2>
          <button className="arena-button secondary arena-button-inline" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? 'Cancel' : 'New table'}
          </button>
        </div>
        {showCreate && (
          <form onSubmit={handleCreate}>
            <label className="arena-label">Table name (optional)</label>
            <input className="arena-field" placeholder="e.g. Friday founders" value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} />
            <label className="arena-label">
              Total seats ({MIN_SEATS}-{MAX_SEATS}, you take seat 1)
            </label>
            <div className="arena-seat-count-picker">
              {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS).map((n) => (
                <button type="button" key={n} className={`arena-chip ${seatCount === n ? 'selected' : ''}`} onClick={() => updateSeatCount(n)}>
                  {n}
                </button>
              ))}
            </div>
            <label className="arena-label">Other seats</label>
            {seatPlan.map((kind, i) => (
              <div className="arena-seat-plan-row" key={i}>
                <span>Seat {i + 2}</span>
                <div className="arena-chip-row">
                  <button type="button" className={`arena-chip ${kind === 'open' ? 'selected' : ''}`} onClick={() => setSeatPlan((prev) => prev.map((k, idx) => (idx === i ? 'open' : k)))}>
                    Open — invite someone
                  </button>
                  <button type="button" className={`arena-chip ${kind === 'ai' ? 'selected' : ''}`} onClick={() => setSeatPlan((prev) => prev.map((k, idx) => (idx === i ? 'ai' : k)))}>
                    AI
                  </button>
                </div>
              </div>
            ))}
            <button className="arena-button primary" type="submit" disabled={creating}>
              {creating ? 'Opening…' : 'Open table'}
            </button>
          </form>
        )}
        <form className="arena-inline-form" onSubmit={handleJoinByCode}>
          <input className="arena-field" placeholder="Have an invite code? Enter it here" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button className="arena-button secondary arena-button-inline" type="submit">Join</button>
        </form>
      </div>

      <div className="arena-panel">
        <h2>My tables</h2>
        {myRooms === null && <p className="arena-muted">Loading…</p>}
        {myRooms?.length === 0 && <p className="arena-muted">You're not at any table yet.</p>}
        <div className="arena-list">
          {myRooms?.map((r) => (
            <RoomRow key={r.id} room={r} seatSummary={seatCounts[r.id] || '…'} onOpen={onOpenRoom} />
          ))}
        </div>
      </div>

      <div className="arena-panel">
        <h2>Open tables</h2>
        {openRooms === null && <p className="arena-muted">Loading…</p>}
        {openRooms?.length === 0 && <p className="arena-muted">No open tables right now — open one!</p>}
        <div className="arena-list">
          {openRooms
            ?.filter((r) => !myRooms?.some((m) => m.id === r.id))
            .map((r) => (
              <RoomRow key={r.id} room={r} seatSummary={seatCounts[r.id] || '…'} onOpen={onOpenRoom} />
            ))}
        </div>
      </div>
    </div>
  );
}
