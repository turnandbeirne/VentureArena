// Applies one client-submitted action to a room's game state and persists
// the resulting move. This is the ONLY place a client-supplied action ever
// touches vm_moves — everything here runs with the service-role client, so
// every check below is an application-level guard standing in for RLS,
// not a backstop on top of it.
//
// Round 13 note: this file used to be checked in hand-minified to a single
// line (see gameRoom.ts's header comment for the same note — there was
// never a bundler step for either file, just bundle.generated.js). Rewritten
// readable here for the same self-review pass; behavior is identical to the
// previous version with two additive changes: the room lookup now also
// selects game_id, and reaching 'gameover' now records the game's results
// (see the recordGameResults call below and gameRoom.ts for that function).
import {
  adminClient,
  callerClientFor,
  gameReducer,
  replayRoom,
  chainResolveAiTurns,
  recordGameResults,
  ONLINE_ROOM_MIN_PLAYERS,
  ONLINE_ROOM_MAX_PLAYERS,
} from '../_shared/gameRoom.ts';

const CLIENT_SUBMITTABLE_ACTION_TYPES = new Set([
  'START_GAME',
  'BUY_ASSET',
  'SELL_ASSET',
  'START_BUSINESS',
  'LEARN_SKILL',
  'UPGRADE_BUSINESS',
  'END_TURN',
  'RESOLVE_EXIT_OFFER',
  'ACK_FORTUNE_CARD',
  'FINALIZE_GAME_OVER',
  'SEND_CHAT',
  'CONVERT_SEAT_TO_AI',
  'REQUEST_BREAK',
]);

// Actions that only the currently-active player may submit — everything
// else in CLIENT_SUBMITTABLE_ACTION_TYPES either has its own bespoke check
// (REQUEST_BREAK, RESOLVE_EXIT_OFFER, CONVERT_SEAT_TO_AI) or none at all
// (START_GAME is host-only and checked separately; SEND_CHAT, ACK_FORTUNE_CARD
// and FINALIZE_GAME_OVER are intentionally open to any seated participant).
const TURN_RESTRICTED_ACTION_TYPES = new Set([
  'BUY_ASSET',
  'SELL_ASSET',
  'START_BUSINESS',
  'LEARN_SKILL',
  'UPGRADE_BUSINESS',
  'END_TURN',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const {
    data: { user: caller },
    error: authError,
  } = await callerClientFor(authHeader).auth.getUser();
  if (authError || !caller) return jsonResponse({ error: 'Invalid session' }, 401);

  const admin = adminClient();

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body must be JSON' }, 400);
  }

  const { roomId, action } = body;
  if (!roomId || !action || typeof action.type !== 'string') {
    return jsonResponse({ error: 'roomId and action.type are required' }, 400);
  }
  if (!CLIENT_SUBMITTABLE_ACTION_TYPES.has(action.type)) {
    return jsonResponse({ error: `Action type "${action.type}" is not client-submittable` }, 400);
  }

  const { data: room, error: roomError } = await admin
    .from('vm_rooms')
    .select('id, game_id, host_id, rng_seed, status')
    .eq('id', roomId)
    .single();
  if (roomError || !room) return jsonResponse({ error: 'Room not found' }, 404);

  const { data: seats, error: seatsError } = await admin
    .from('vm_room_seats')
    .select('seat_index, user_id, bot_personality_id')
    .eq('room_id', roomId)
    .order('seat_index', { ascending: true });
  if (seatsError || !seats) return jsonResponse({ error: 'Could not load seats' }, 500);

  const mySeat = seats.find((s) => s.user_id === caller.id);
  const mySeatIndex = mySeat ? mySeat.seat_index : null;

  const { data: moves, error: movesError } = await admin
    .from('vm_moves')
    .select('seq, seat_index, action, created_at')
    .eq('room_id', roomId)
    .order('seq', { ascending: true });
  if (movesError) return jsonResponse({ error: 'Could not load move history' }, 500);

  if (action.type === 'START_GAME') {
    if ((moves?.length ?? 0) > 0) return jsonResponse({ error: 'Room already started' }, 409);
    if (caller.id !== room.host_id) return jsonResponse({ error: 'Only the host can start the room' }, 403);
    if (seats.length < ONLINE_ROOM_MIN_PLAYERS || seats.length > ONLINE_ROOM_MAX_PLAYERS) {
      return jsonResponse(
        { error: `Rooms need ${ONLINE_ROOM_MIN_PLAYERS}-${ONLINE_ROOM_MAX_PLAYERS} seats (this room has ${seats.length})` },
        409,
      );
    }
    const orderedSeats = [...seats].sort((a, b) => a.seat_index - b.seat_index);
    if (!orderedSeats.every((s, i) => s.seat_index === i)) {
      return jsonResponse({ error: 'Seat indexes must be contiguous starting at 0 — a seat is missing' }, 409);
    }

    const humanUserIds = orderedSeats.filter((s) => s.user_id).map((s) => s.user_id);
    const { data: humanProfiles } = humanUserIds.length
      ? await admin.from('vm_profiles').select('id, display_name, avatar').in('id', humanUserIds)
      : { data: [] };
    const profileById = new Map((humanProfiles ?? []).map((p) => [p.id, p]));

    const startAction = {
      type: 'START_GAME',
      mode: {
        type: 'online',
        seats: orderedSeats.map((s) =>
          s.user_id
            ? {
                type: 'human',
                name: profileById.get(s.user_id)?.display_name ?? 'Player',
                avatar: profileById.get(s.user_id)?.avatar ?? undefined,
              }
            : { type: 'ai', personalityId: s.bot_personality_id === 'random' ? undefined : (s.bot_personality_id ?? undefined) },
        ),
      },
      difficultyId: typeof action.difficultyId === 'string' ? action.difficultyId : undefined,
      scenarioId: typeof action.scenarioId === 'string' ? action.scenarioId : undefined,
    };

    let state = replayRoom(room.rng_seed, [{ action: startAction }]);
    const { error: insertError } = await admin.from('vm_moves').insert({
      room_id: roomId,
      seq: 0,
      seat_index: mySeatIndex ?? 0,
      action: startAction,
      resulting_log_entries: state.log ?? [],
    });
    if (insertError) return jsonResponse({ error: 'Could not persist move' }, 500);

    await admin.from('vm_rooms').update({ status: 'active' }).eq('id', roomId);
    // Arena: give every seat its table color (ranked choice with fallback —
    // see vm_assign_seat_colors in migration 0006). Cosmetic, so a failure
    // here must not block the game from starting.
    try { await admin.rpc('vm_assign_seat_colors', { p_room_id: roomId }); } catch (err) { console.error('seat colors', err); }
    state = await chainResolveAiTurns(admin, roomId, state, 1);
    await syncAiSeats(admin, roomId, state);
    return jsonResponse({ state });
  }

  if (mySeatIndex === null) return jsonResponse({ error: 'You do not have a seat in this room' }, 403);
  if (!moves || moves.length === 0) return jsonResponse({ error: 'Room has not started yet' }, 409);

  const currentState = replayRoom(room.rng_seed, moves);
  const myPlayerId = currentState?.players?.[mySeatIndex]?.id;
  if (!myPlayerId) return jsonResponse({ error: 'Could not resolve your player id for this room' }, 500);

  if (action.type === 'REQUEST_BREAK') {
    const blockingPlayerId =
      currentState.status === 'playing'
        ? currentState.players[currentState.activePlayerIndex]?.id
        : currentState.status === 'exitOffer'
          ? currentState.pendingExitOffer?.playerId
          : null;
    if (!blockingPlayerId || blockingPlayerId !== myPlayerId) {
      return jsonResponse({ error: "You can only request a break while it's your seat blocking the game" }, 409);
    }
    const minutes = Math.max(1, Math.min(1440, Number(action.minutes) || 1440));
    const breakUntil = new Date(Date.now() + minutes * 60000).toISOString();
    const { error: breakError } = await admin.from('vm_rooms').update({ break_until: breakUntil }).eq('id', roomId);
    return breakError ? jsonResponse({ error: 'Could not set break' }, 500) : jsonResponse({ ok: true, breakUntil });
  }

  if (TURN_RESTRICTED_ACTION_TYPES.has(action.type)) {
    const activePlayer = currentState.players[currentState.activePlayerIndex];
    if (!activePlayer || activePlayer.id !== myPlayerId) return jsonResponse({ error: 'It is not your turn' }, 409);
  }
  if (action.type === 'RESOLVE_EXIT_OFFER' && currentState?.pendingExitOffer?.playerId !== myPlayerId) {
    return jsonResponse({ error: 'No pending exit offer for you' }, 409);
  }
  if (action.type === 'CONVERT_SEAT_TO_AI' && currentState.players.find((p) => p.id === myPlayerId)?.type === 'ai') {
    return jsonResponse({ error: 'Already AI-controlled' }, 409);
  }

  const fullAction = { ...action, playerId: myPlayerId };
  let nextState = gameReducer(currentState, fullAction);
  if (nextState?.lastError) return jsonResponse({ error: nextState.lastError }, 400);

  const newLogEntries = (nextState.log ?? []).slice((currentState.log ?? []).length);
  const nextSeq = moves.length;
  const { error: insertError } = await admin.from('vm_moves').insert({
    room_id: roomId,
    seq: nextSeq,
    seat_index: mySeatIndex,
    action: fullAction,
    resulting_log_entries: newLogEntries,
  });
  if (insertError) return jsonResponse({ error: 'Could not persist move' }, 500);

  nextState = await chainResolveAiTurns(admin, roomId, nextState, nextSeq + 1);
  await syncAiSeats(admin, roomId, nextState);

  if (nextState.status === 'gameover') {
    // Whoever's request wins this atomic transition is the only one that
    // ever records results — a second client dispatching FINALIZE_GAME_OVER
    // after the room is already 'finished' matches zero rows here and
    // skips recordGameResults entirely. See gameRoom.ts's comment on
    // recordGameResults for why this is the idempotency boundary rather
    // than something inside that function.
    const { data: justFinished } = await admin
      .from('vm_rooms')
      .update({ status: 'finished' })
      .eq('id', roomId)
      .eq('status', 'active')
      .select('id');
    if (justFinished && justFinished.length > 0) {
      const { data: fullMoves } = await admin
        .from('vm_moves')
        .select('seq, seat_index, action, created_at')
        .eq('room_id', roomId)
        .order('seq', { ascending: true });
      await recordGameResults(admin, { roomId, gameId: room.game_id, seats, finalState: nextState, rngSeed: room.rng_seed, moves: fullMoves ?? [] });
    }
  }

  return jsonResponse({ state: nextState });
});

/** Any seat the reducer resolved to an AI personality (a human seat
 * converted mid-game, or an AI seat whose "random" placeholder just got
 * resolved at START_GAME) gets that personality persisted back to
 * vm_room_seats — otherwise the next request's fresh `replayRoom` would
 * re-resolve "random" into a DIFFERENT personality every time, changing
 * who's "playing" from request to request. */
async function syncAiSeats(admin, roomId, state) {
  if (!state?.players) return;
  const aiSeats = state.players.map((player, seatIndex) => ({ seatIndex, player })).filter(({ player }) => player.type === 'ai');
  for (const { seatIndex, player } of aiSeats) {
    await admin.from('vm_room_seats').update({ bot_personality_id: player.personalityId }).eq('room_id', roomId).eq('seat_index', seatIndex);
  }
}
