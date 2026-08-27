import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { fetchMoves, fetchProfilesByIds, fetchRoom, fetchRoomByInviteCode, fetchSeats } from '../lib/rooms.js';
import { replayRoom } from '../lib/replay.js';
import SeatingPanel from './room/SeatingPanel.jsx';
import ArenaGameBoard from './room/ArenaGameBoard.jsx';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RoomScreen({ session, roomParam, onLeave }) {
  const [room, setRoom] = useState(undefined); // undefined = loading, null = not found
  const [seats, setSeats] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      let roomRow;
      if (UUID_RE.test(roomParam)) {
        roomRow = await fetchRoom(roomParam);
      } else {
        roomRow = await fetchRoomByInviteCode(roomParam.trim());
      }
      if (!roomRow) {
        setRoom(null);
        return;
      }
      setRoom(roomRow);

      const seatRows = await fetchSeats(roomRow.id);
      setSeats(seatRows);
      const profileMap = await fetchProfilesByIds(seatRows.map((s) => s.user_id));
      setProfiles(profileMap);

      if (roomRow.status !== 'open') {
        const moves = await fetchMoves(roomRow.id);
        if (moves.length > 0) {
          setGameState(replayRoom(roomRow.rng_seed, moves));
        }
      } else {
        setGameState(null);
      }
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load this room');
    }
  }, [roomParam]);

  useEffect(() => {
    setRoom(undefined);
    load();
  }, [load]);

  useEffect(() => {
    if (!room?.id) return undefined;
    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vm_moves', filter: `room_id=eq.${room.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vm_room_seats', filter: `room_id=eq.${room.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vm_rooms', filter: `id=eq.${room.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  const inviteUrl = room ? (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.invite_code);
    return url.toString();
  })() : null;

  const [copied, setCopied] = useState(false);
  function copyInvite() {
    navigator.clipboard?.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const mySeat = seats.find((s) => s.user_id === session.user.id);
  const mySeatIndex = mySeat ? mySeat.seat_index : null;

  // Once the real board is up, it renders its own Brand/header (and its own
  // "← Lobby" control) — VentureFlow's board is a full screen in its own
  // right, not a panel inside another page's chrome. Keeping this page's
  // own header on top of that would just be two headers stacked, so it's
  // shown only for the states that have no header of their own: still
  // loading, not found, an error, or the pre-game seating panel.
  const showPageHeader = !(room && room.status !== 'open' && gameState);

  return (
    <div className="arena-page">
      {showPageHeader && (
        <div className="arena-page-header">
          <div>
            <h1>Room {room ? room.invite_code : ''}</h1>
            {room && (
              <p className="subtitle">
                <button className="arena-link-button" onClick={copyInvite}>
                  {copied ? 'Copied!' : 'Copy invite link'}
                </button>
              </p>
            )}
          </div>
          <button className="arena-button secondary arena-button-inline" onClick={onLeave}>
            ← Lobby
          </button>
        </div>
      )}

      {error && <div className="arena-error">{error}</div>}
      {room === undefined && <p className="arena-muted">Loading…</p>}
      {room === null && <p className="arena-error">No room found for "{roomParam}".</p>}

      {room && room.status === 'open' && (
        <SeatingPanel room={room} seats={seats} profiles={profiles} session={session} onChanged={load} />
      )}

      {room && room.status !== 'open' && gameState && (
        <ArenaGameBoard room={room} gameState={gameState} mySeatIndex={mySeatIndex} session={session} onChanged={load} onLeave={onLeave} />
      )}

      {room && room.status !== 'open' && !gameState && <p className="arena-muted">Loading game state…</p>}
    </div>
  );
}
