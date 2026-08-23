import { useState } from 'react';
import { assignBotSeat, claimSeat, openSeat, vacateSeat } from '../../lib/rooms.js';
import { resolveMove } from '../../lib/supabaseClient.js';

export default function SeatingPanel({ room, seats, profiles, session, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isHost = room.host_id === session.user.id;
  const mySeat = seats.find((s) => s.user_id === session.user.id);
  const allFilled = seats.every((s) => s.user_id || s.bot_personality_id);

  async function run(fn) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    await run(async () => {
      await resolveMove(room.id, { type: 'START_GAME' });
    });
  }

  return (
    <div className="arena-panel">
      <h2>Seats</h2>
      {error && <div className="arena-error">{error}</div>}
      <div className="arena-seats">
        {seats.map((seat) => {
          const isMe = seat.user_id === session.user.id;
          const profile = seat.user_id ? profiles[seat.user_id] : null;
          return (
            <div className="arena-seat-row" key={seat.seat_index}>
              <span className="arena-seat-index">Seat {seat.seat_index + 1}</span>
              {seat.user_id ? (
                <span className="arena-seat-occupant">
                  {profile?.avatar || '🙂'} {isMe ? 'You' : profile?.display_name || 'Player'}
                  {seat.seat_index === 0 ? ' (host)' : ''}
                </span>
              ) : seat.bot_personality_id ? (
                <span className="arena-seat-occupant">🤖 AI ({seat.bot_personality_id})</span>
              ) : (
                <span className="arena-seat-occupant arena-muted">Open</span>
              )}
              <span className="arena-seat-actions">
                {!seat.user_id && !seat.bot_personality_id && !mySeat && (
                  <button
                    className="arena-button primary arena-button-inline"
                    disabled={busy}
                    onClick={() => run(() => claimSeat(room.id, seat.seat_index, session.user.id))}
                  >
                    Join
                  </button>
                )}
                {isMe && seat.seat_index !== 0 && (
                  <button
                    className="arena-button secondary arena-button-inline"
                    disabled={busy}
                    onClick={() => run(() => vacateSeat(room.id, seat.seat_index))}
                  >
                    Leave seat
                  </button>
                )}
                {isHost && seat.seat_index !== 0 && !seat.bot_personality_id && (
                  <button
                    className="arena-button secondary arena-button-inline"
                    disabled={busy}
                    onClick={() => run(() => assignBotSeat(room.id, seat.seat_index, 'random'))}
                  >
                    Fill with AI
                  </button>
                )}
                {isHost && seat.seat_index !== 0 && seat.bot_personality_id && (
                  <button
                    className="arena-button secondary arena-button-inline"
                    disabled={busy}
                    onClick={() => run(() => openSeat(room.id, seat.seat_index))}
                  >
                    Open seat
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="arena-muted">
        Invite code <strong>{room.invite_code}</strong> — share the link at the top of this page, or this code, with
        whoever should take an open seat.
      </p>

      {isHost && (
        <button className="arena-button primary" disabled={busy || !allFilled} onClick={handleStart}>
          {allFilled ? 'Start game' : 'Fill all seats to start'}
        </button>
      )}
      {!isHost && <p className="arena-muted">Waiting for the host to start the game once every seat is filled.</p>}
    </div>
  );
}
