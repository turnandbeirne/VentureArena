// Cron-invoked (see vm_app_config's sweep_cron_secret comment for the auth
// story): finds every active room where a human seat has gone idle past
// its timeout, converts that one seat to AI, and lets the game continue
// without that player rather than blocking everyone else at the table
// forever.
//
// Round 13 note: this file used to be checked in hand-minified to a single
// line, same as gameRoom.ts and resolve-move/index.ts — rewritten readable
// here as part of the same self-review pass, behavior-identical except for
// the additive recordGameResults call at the bottom of the loop body (a
// seat conversion can itself push a room straight to gameover, e.g. the
// last human holdout on the final month — that path needs to record
// results exactly like resolve-move's does, or games that end this way
// would simply never appear on the leaderboard).
import { adminClient, replayRoom, chainResolveAiTurns, driveUnattendedTable, gameReducer, recordGameResults } from '../_shared/gameRoom.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}

/** Compared against public.vm_app_config's 'sweep_cron_secret' row
 * (service-role read, RLS-locked to everyone else) rather than a Deno.env
 * var — see that table's migration comment for why. Fails CLOSED (401) if
 * the row is somehow missing, not open. */
async function checkSecret(admin, req) {
  const { data: row } = await admin.from('vm_app_config').select('value').eq('key', 'sweep_cron_secret').maybeSingle();
  return Boolean(row?.value) && req.headers.get('x-cron-secret') === row.value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const admin = adminClient();
  if (!(await checkSecret(admin, req))) return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });

  const { data: activeRooms, error: roomsError } = await admin
    .from('vm_rooms')
    .select('id, game_id, rng_seed, turn_timeout_minutes, break_until')
    .eq('status', 'active');
  if (roomsError) return jsonResponse({ error: roomsError.message }, 500);

  const results = [];

  for (const room of activeRooms ?? []) {
    if (room.turn_timeout_minutes == null) {
      results.push({ roomId: room.id, skipped: 'room set to never time out' });
      continue;
    }

    const { data: moves } = await admin
      .from('vm_moves')
      .select('seq, seat_index, action, created_at')
      .eq('room_id', room.id)
      .order('seq', { ascending: true });
    if (!moves || moves.length === 0) {
      results.push({ roomId: room.id, skipped: 'not started' });
      continue;
    }

    const breakUntilMs = room.break_until ? new Date(room.break_until).getTime() : 0;
    const nowMs = Date.now();
    if (breakUntilMs > nowMs) {
      results.push({ roomId: room.id, skipped: `on a break until ${room.break_until}` });
      continue;
    }

    const lastMoveMs = new Date(moves[moves.length - 1].created_at).getTime();
    const effectiveSinceMs = Math.max(lastMoveMs, breakUntilMs);
    const idleMinutes = (nowMs - effectiveSinceMs) / 60000;
    const takeoverThresholdMinutes = room.turn_timeout_minutes * 2;
    if (idleMinutes < takeoverThresholdMinutes) {
      results.push({
        roomId: room.id,
        skipped: `only ${idleMinutes.toFixed(1)}m idle (takes ${takeoverThresholdMinutes}m: warned at ${room.turn_timeout_minutes}m, converts at ${takeoverThresholdMinutes}m)`,
      });
      continue;
    }

    const currentState = replayRoom(room.rng_seed, moves);
    const blockingPlayerId =
      currentState.status === 'exitOffer'
        ? (currentState.pendingExitOffer?.playerId ?? null)
        : currentState.status === 'playing'
          ? (currentState.players[currentState.activePlayerIndex]?.id ?? null)
          : null;
    if (!blockingPlayerId) {
      // Arena: an all-AI table paused on a fortune card or the game-ending
      // countdown has nobody to tap "continue" — drive it to the finish.
      if (currentState.players.every((p) => p.type !== 'human') && currentState.status !== 'gameover') {
        const driven = await driveUnattendedTable(admin, room.id, currentState, moves.length);
        if (driven.status === 'gameover') await finishRoom(admin, room, driven);
        results.push({ roomId: room.id, advancedAiTable: true, status: driven.status, month: driven.month });
        continue;
      }
      results.push({ roomId: room.id, skipped: 'nobody currently blocking' });
      continue;
    }

    const blockingSeatIndex = currentState.players.findIndex((p) => p.id === blockingPlayerId);
    const blockingPlayer = currentState.players[blockingSeatIndex];
    if (!blockingPlayer) {
      results.push({ roomId: room.id, skipped: 'could not resolve the blocking seat' });
      continue;
    }

    let nextState = currentState;
    let nextSeq = moves.length;
    if (blockingPlayer.type === 'human') {
      const conversionAction = { type: 'CONVERT_SEAT_TO_AI', playerId: blockingPlayerId };
      nextState = gameReducer(currentState, conversionAction);
      const newLogEntries = (nextState.log ?? []).slice((currentState.log ?? []).length);
      await admin.from('vm_moves').insert({
        room_id: room.id,
        seq: nextSeq,
        seat_index: blockingSeatIndex,
        action: conversionAction,
        resulting_log_entries: newLogEntries,
      });
      nextSeq += 1;
    }
    // Arena: an all-AI table (every human converted, or a chain that hit
    // MAX_AI_TURNS last time) used to sit 'active' forever because nothing
    // ever dispatched its next AI turn. Drive it forward here so it reaches
    // gameover and records results like any other room.
    nextState = await chainResolveAiTurns(admin, room.id, nextState, nextSeq);
    if (nextState.status !== 'gameover' && nextState.players.every((p) => p.type !== 'human')) {
      const { count } = await admin.from('vm_moves').select('seq', { count: 'exact', head: true }).eq('room_id', room.id);
      nextState = await driveUnattendedTable(admin, room.id, nextState, count ?? nextSeq);
    }

    const aiSeats = nextState.players.map((player, seatIndex) => ({ seatIndex, player })).filter(({ player }) => player.type === 'ai');
    for (const { seatIndex, player } of aiSeats) {
      await admin.from('vm_room_seats').update({ bot_personality_id: player.personalityId }).eq('room_id', room.id).eq('seat_index', seatIndex);
    }

    if (nextState.status === 'gameover') await finishRoom(admin, room, nextState);

    // A conversion clears any stale break_until so the (now-AI) seat's next
    // human successor, if any, doesn't inherit an unrelated grace window.
    await admin.from('vm_rooms').update({ break_until: null }).eq('id', room.id);

    results.push(
      blockingPlayer.type === 'human'
        ? { roomId: room.id, convertedPlayerId: blockingPlayerId }
        : { roomId: room.id, advancedAiTable: true, status: nextState.status, month: nextState.month },
    );
  }

  return jsonResponse({ results });
});

/** Same atomic idempotency guard as resolve-move: only the request that
 * actually flips the row from 'active' to 'finished' records results. A
 * room can reach gameover via this timeout path just as easily as via a
 * human's FINALIZE_GAME_OVER (e.g. the very last human holdout gets
 * converted on the final month) — without this, games that end this way
 * would silently never reach the leaderboard. */
async function finishRoom(admin, room, finalState) {
  const { data: justFinished } = await admin
    .from('vm_rooms')
    .update({ status: 'finished' })
    .eq('id', room.id)
    .eq('status', 'active')
    .select('id');
  if (!justFinished || justFinished.length === 0) return;
  const { data: seats } = await admin.from('vm_room_seats').select('seat_index, user_id').eq('room_id', room.id);
  const { data: fullMoves } = await admin
    .from('vm_moves')
    .select('seq, seat_index, action, created_at')
    .eq('room_id', room.id)
    .order('seq', { ascending: true });
  await recordGameResults(admin, { roomId: room.id, gameId: room.game_id, seats: seats ?? [], finalState, rngSeed: room.rng_seed, moves: fullMoves ?? [] });
}
