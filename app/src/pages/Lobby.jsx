import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { createRoom, getVentureflowGameId, listMyRooms, listOpenRooms, fetchSeats } from '../lib/rooms.js';

const MIN_SEATS = 2;
const MAX_SEATS = 5;

function RoomRow({ room, seatSummary, onOpen }) {
  return (
    <button className="arena-list-row" onClick={() => onOpen(room.invite_code)}>
      <div>
        <div className="arena-list-row-title">
          Room {room.invite_code} <span className={`arena-badge status-${room.status}`}>{room.status}</span>
        </div>
        <div className="arena-list-row-sub">
          {seatSummary} · created {new Date(room.created_at).toLocaleString()}
        </div>
      </div>
      <span className="arena-list-row-arrow">→</span>
    </button>
  );
}

export default function Lobby({ session, onOpenRoom }) {
  const isGuest = session.user.is_anonymous;
  const [myRooms, setMyRooms] = useState(null);
  const [openRooms, setOpenRooms] = useState(null);
  const [seatCounts, setSeatCounts] = useState({}); // roomId -> "2/4 seats"
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [seatCount, setSeatCount] = useState(3);
  // For seats 1..N-1 (seat 0 is always the host): 'ai' | 'open'
  const [seatPlan, setSeatPlan] = useState(['ai', 'open']);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState('');

  async function refresh() {
    setError(null);
    try {
      const [mine, open] = await Promise.all([listMyRooms(session.user.id), listOpenRooms()]);
      setMyRooms(mine);
      setOpenRooms(open);
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
      setError(err.message || 'Could not load rooms');
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
      const room = await createRoom({ hostId: session.user.id, gameId, seatPlan });
      onOpenRoom(room.invite_code);
    } catch (err) {
      setError(err.message || 'Could not create room');
    } finally {
      setCreating(false);
    }
  }

  function handleJoinByCode(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onOpenRoom(joinCode.trim());
  }

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <div>
          <h1>VentureMaker Arena</h1>
          <p className="subtitle">
            Signed in as {isGuest ? 'a guest' : session.user.email}
          </p>
        </div>
        <button className="arena-button secondary arena-button-inline" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      {error && <div className="arena-error">{error}</div>}

      <div className="arena-panel">
        <form className="arena-inline-form" onSubmit={handleJoinByCode}>
          <input
            className="arena-field"
            placeholder="Have an invite code? Enter it here"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button className="arena-button primary arena-button-inline" type="submit">
            Join
          </button>
        </form>
      </div>

      <div className="arena-panel">
        <div className="arena-panel-header">
          <h2>Create a room</h2>
          <button className="arena-button secondary arena-button-inline" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? 'Cancel' : 'New room'}
          </button>
        </div>
        {showCreate && (
          <form onSubmit={handleCreate}>
            <label className="arena-label">
              Total seats ({MIN_SEATS}-{MAX_SEATS}, you take seat 1)
            </label>
            <div className="arena-seat-count-picker">
              {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS).map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`arena-chip ${seatCount === n ? 'selected' : ''}`}
                  onClick={() => updateSeatCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="arena-label">Other seats</label>
            {seatPlan.map((kind, i) => (
              <div className="arena-seat-plan-row" key={i}>
                <span>Seat {i + 2}</span>
                <div className="arena-chip-row">
                  <button
                    type="button"
                    className={`arena-chip ${kind === 'open' ? 'selected' : ''}`}
                    onClick={() =>
                      setSeatPlan((prev) => prev.map((k, idx) => (idx === i ? 'open' : k)))
                    }
                  >
                    Open — invite someone
                  </button>
                  <button
                    type="button"
                    className={`arena-chip ${kind === 'ai' ? 'selected' : ''}`}
                    onClick={() => setSeatPlan((prev) => prev.map((k, idx) => (idx === i ? 'ai' : k)))}
                  >
                    AI
                  </button>
                </div>
              </div>
            ))}
            <button className="arena-button primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create room'}
            </button>
          </form>
        )}
      </div>

      <div className="arena-panel">
        <h2>My rooms</h2>
        {myRooms === null && <p className="arena-muted">Loading…</p>}
        {myRooms?.length === 0 && <p className="arena-muted">You're not in any rooms yet.</p>}
        <div className="arena-list">
          {myRooms?.map((r) => (
            <RoomRow key={r.id} room={r} seatSummary={seatCounts[r.id] || '…'} onOpen={onOpenRoom} />
          ))}
        </div>
      </div>

      <div className="arena-panel">
        <h2>Open rooms</h2>
        {openRooms === null && <p className="arena-muted">Loading…</p>}
        {openRooms?.length === 0 && <p className="arena-muted">No open rooms right now — create one!</p>}
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
