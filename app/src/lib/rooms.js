import { supabase } from './supabaseClient.js';

/** The only game registered so far — see supabase/migrations/0001_init.sql.
 * Looked up by slug rather than hardcoding an id since the id is
 * server-generated. */
export async function getVentureflowGameId() {
  const { data, error } = await supabase.from('vm_games').select('id').eq('slug', 'ventureflow').single();
  if (error) throw error;
  return data.id;
}

export async function fetchProfilesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase.from('vm_profiles').select('id, display_name, avatar').in('id', uniqueIds);
  if (error) throw error;
  const byId = {};
  for (const p of data) byId[p.id] = p;
  return byId;
}

/** Rooms the current user is host of, or holds a seat in — any status, so
 * they can rejoin an in-progress or finished game. */
export async function listMyRooms(userId) {
  const [{ data: seatRows, error: seatErr }, { data: hostRooms, error: hostErr }] = await Promise.all([
    supabase.from('vm_room_seats').select('room_id').eq('user_id', userId),
    supabase.from('vm_rooms').select('*').eq('host_id', userId),
  ]);
  if (seatErr) throw seatErr;
  if (hostErr) throw hostErr;
  const seatedRoomIds = [...new Set((seatRows || []).map((r) => r.room_id))];
  const alreadyHave = new Set((hostRooms || []).map((r) => r.id));
  const otherIds = seatedRoomIds.filter((id) => !alreadyHave.has(id));
  let seatedRooms = [];
  if (otherIds.length > 0) {
    const { data, error } = await supabase.from('vm_rooms').select('*').in('id', otherIds);
    if (error) throw error;
    seatedRooms = data;
  }
  const all = [...(hostRooms || []), ...seatedRooms];
  all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return all;
}

/** Open rooms anyone can browse and join — a public matchmaking list, not
 * just invite-code-only. */
export async function listOpenRooms() {
  const { data, error } = await supabase
    .from('vm_rooms')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

export async function fetchSeats(roomId) {
  const { data, error } = await supabase
    .from('vm_room_seats')
    .select('*')
    .eq('room_id', roomId)
    .order('seat_index', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchRoomByInviteCode(inviteCode) {
  const { data, error } = await supabase.from('vm_rooms').select('*').eq('invite_code', inviteCode).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchRoom(roomId) {
  const { data, error } = await supabase.from('vm_rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMoves(roomId) {
  const { data, error } = await supabase
    .from('vm_moves')
    .select('seq, seat_index, action, resulting_log_entries, created_at')
    .eq('room_id', roomId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data;
}

/** seatPlan: array (length 2-5) of 'ai' | 'open' for seats 1..N-1 — seat 0
 * is always the host, seated immediately as human. An 'ai' seat is
 * immediately assigned a random personality (resolve-move's START_GAME
 * picks the actual bot identity if this is left as 'random'). */
export async function createRoom({ hostId, gameId, seatPlan, turnTimeoutHours }) {
  const { data: rooms, error: roomErr } = await supabase
    .from('vm_rooms')
    .insert({ game_id: gameId, host_id: hostId, turn_timeout_hours: turnTimeoutHours || 48 })
    .select()
    .single();
  if (roomErr) throw roomErr;
  const room = rooms;

  const seatRows = [{ room_id: room.id, seat_index: 0, user_id: hostId }];
  seatPlan.forEach((kind, i) => {
    const seat_index = i + 1;
    if (kind === 'ai') {
      seatRows.push({ room_id: room.id, seat_index, bot_personality_id: 'random' });
    } else {
      seatRows.push({ room_id: room.id, seat_index }); // open — both null
    }
  });
  const { error: seatErr } = await supabase.from('vm_room_seats').insert(seatRows);
  if (seatErr) throw seatErr;

  return room;
}

export async function claimSeat(roomId, seatIndex, userId) {
  const { error } = await supabase
    .from('vm_room_seats')
    .update({ user_id: userId })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
  if (error) throw error;
}

export async function vacateSeat(roomId, seatIndex) {
  const { error } = await supabase
    .from('vm_room_seats')
    .update({ user_id: null })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
  if (error) throw error;
}

/** Host-only (enforced by RLS) — fill a still-open seat with AI, or swap an
 * existing AI seat to a different personality before the game starts. */
export async function assignBotSeat(roomId, seatIndex, personalityId = 'random') {
  const { error } = await supabase
    .from('vm_room_seats')
    .update({ user_id: null, bot_personality_id: personalityId })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
  if (error) throw error;
}

/** Host-only — open the seat back up (clear both occupant fields) so
 * someone else can claim it or it can be reassigned. */
export async function openSeat(roomId, seatIndex) {
  const { error } = await supabase
    .from('vm_room_seats')
    .update({ user_id: null, bot_personality_id: null })
    .eq('room_id', roomId)
    .eq('seat_index', seatIndex);
  if (error) throw error;
}
