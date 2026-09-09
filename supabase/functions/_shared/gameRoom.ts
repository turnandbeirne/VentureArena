// Shared helpers for every Edge Function that runs the VentureFlow game
// engine against a `vm_rooms` row: resolve-move (the per-action endpoint)
// and sweep-missing-players (the idle-timeout cron). Both import this file
// directly by relative path — it is NOT run through esbuild, only
// bundle.generated.js (the actual game engine) is; see
// scripts/bundle-game-engine.mjs's header comment for why that one has to
// be minified and this one doesn't.
//
// Round 13 note: this file used to be checked in hand-minified to a single
// line, for reasons lost to time — there was never a bundler step for it,
// unlike bundle.generated.js. Rewritten readable here as part of a
// self-review pass ("best practices, no bugs before shipping"); the only
// *behavioral* addition is the new `recordGameResults` export at the
// bottom. Everything above it is the exact same logic the minified version
// had, just formatted.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeStyleSignals, mergePersona, ratingUpdates } from './arenaSignals.ts';
import {
  gameReducer,
  seedRng,
  netWorth,
  ONLINE_ROOM_MIN_PLAYERS,
  ONLINE_ROOM_MAX_PLAYERS,
} from './bundle.generated.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

/** Service-role client — bypasses RLS entirely. This is what lets these
 * functions read/write vm_rooms/vm_moves/vm_room_seats (and, as of Round
 * 13, insert into vm_player_events/vm_badge_awards) regardless of the
 * calling user's own row-level permissions; every write below is gated by
 * application logic in this file instead, not by RLS. */
export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

/** A client scoped to whoever's Authorization header was forwarded — used
 * only to resolve `auth.getUser()` for the caller's identity, never for
 * data access (that's always the admin client above). */
export function callerClientFor(authHeader) {
  return createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  });
}

export { gameReducer, seedRng, netWorth, ONLINE_ROOM_MIN_PLAYERS, ONLINE_ROOM_MAX_PLAYERS };

/** Replays a room's full move history from scratch through the pure
 * reducer to get its current state. Rooms don't persist a state snapshot —
 * `vm_moves` is the only source of truth, so every request recomputes it.
 * (Fine at today's scale; see the README's "known gaps" if move counts per
 * room ever get large enough for this to matter.) */
export function replayRoom(rngSeed, moves) {
  seedRng(rngSeed);
  let state = null;
  for (const move of moves) state = gameReducer(state, move.action);
  return state;
}

/** After a human action resolves, the engine may now be waiting on one or
 * more AI seats in a row (nothing dispatches on their behalf otherwise).
 * Drives up to MAX_AI_TURNS of them forward synchronously so the HTTP
 * response the human's client gets back already reflects however far the
 * game could progress on its own — capped so a pathological loop can't
 * hang the request forever. */
export async function chainResolveAiTurns(admin, roomId, state, nextSeq) {
  const MAX_AI_TURNS = 40;
  let current = state;
  let seq = nextSeq;
  for (let i = 0; i < MAX_AI_TURNS && current.status === 'playing'; i++) {
    const activeIndex = current.activePlayerIndex;
    const activePlayer = current.players[activeIndex];
    if (!activePlayer || activePlayer.type !== 'ai') break;
    const action = { type: 'RUN_AI_TURN', playerId: activePlayer.id };
    const next = gameReducer(current, action);
    const newLogEntries = (next.log ?? []).slice((current.log ?? []).length);
    await admin
      .from('vm_moves')
      .insert({ room_id: roomId, seq, seat_index: activeIndex, action, resulting_log_entries: newLogEntries });
    seq += 1;
    current = next;
  }
  return current;
}

/** Arena: a table with no human seats left (everyone resigned or was
 * converted) has nobody to acknowledge fortune cards or finalize game over,
 * so it would sit in 'monthRecap' / 'gameEnding' forever. Drives such a
 * table all the way to gameover, persisting each synthetic move like a
 * client would have. No-op when a human is still seated. */
export async function driveUnattendedTable(admin, roomId, state, nextSeq) {
  let current = state;
  let seq = nextSeq;
  const noHumans = () => (current?.players ?? []).every((p) => p.type !== 'human');
  for (let i = 0; i < 400 && current && current.status !== 'gameover' && noHumans(); i++) {
    let action = null;
    if (current.status === 'monthRecap') action = { type: 'ACK_FORTUNE_CARD' };
    else if (current.status === 'gameEnding') action = { type: 'FINALIZE_GAME_OVER' };
    else if (current.status === 'playing') {
      current = await chainResolveAiTurns(admin, roomId, current, seq);
      seq = await countMoves(admin, roomId); // chain persisted its own moves; resync
      if (current.status === 'playing') break; // chain hit its cap — the next sweep continues
      continue;
    } else break;
    const next = gameReducer(current, action);
    const newLogEntries = (next.log ?? []).slice((current.log ?? []).length);
    await admin.from('vm_moves').insert({ room_id: roomId, seq, seat_index: 0, action, resulting_log_entries: newLogEntries });
    seq += 1;
    current = next;
  }
  return current;
}

async function countMoves(admin, roomId) {
  const { count } = await admin.from('vm_moves').select('seq', { count: 'exact', head: true }).eq('room_id', roomId);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Round 13: global leaderboard + badge awards
// ---------------------------------------------------------------------------
// Called from both resolve-move and sweep-missing-players at the one moment
// each of them can independently be the thing that pushes a room's state to
// 'gameover' (a human hitting "Finalize" vs. an idle sweep converting the
// last blocking human seat to AI and then chaining that AI to the finish).
// Both callers gate this behind the SAME atomic guard: only call it after
// an `update vm_rooms set status='finished' where id=... and status='active'`
// that actually affected a row. Postgres serializes concurrent updates to
// the same row, so whichever request wins that race is the only one that
// ever sees a non-empty result — this function itself doesn't need to
// re-check anything to stay idempotent, and never runs twice for one room.
//
// Everything recorded here comes from `finalState`, which both callers only
// ever obtain by running the real reducer server-side — never from a number
// a client sent us directly.
export async function recordGameResults(admin, { roomId, gameId, seats, finalState, rngSeed, moves }) {
  const players = finalState?.players;
  if (!Array.isArray(players) || players.length === 0) return;

  const userIdBySeatIndex = new Map((seats ?? []).filter((s) => s.user_id).map((s) => [s.seat_index, s.user_id]));

  // Same ranking the engine itself uses to pick a winner (turnEngine.js) —
  // Array#sort is stable, so ties keep each player's original seat order,
  // matching `winnerId` exactly for first place.
  const ranked = [...players]
    .map((player, seatIndex) => ({ player, seatIndex, score: netWorth(player, finalState.assetPrices) }))
    .sort((a, b) => b.score - a.score);

  const eventRows = [];
  const badgeRows = [];

  ranked.forEach(({ player, seatIndex, score }, rankIndex) => {
    const userId = userIdBySeatIndex.get(seatIndex);
    if (!userId) return; // AI seat, or a seat that was never claimed — nothing to score

    eventRows.push({
      user_id: userId,
      game_id: gameId,
      room_id: roomId,
      event_type: 'game_finished',
      points: score,
      metadata: { placement: rankIndex + 1, player_count: players.length, month: finalState.month },
    });

    for (const badgeEvent of player.badgeEvents ?? []) {
      badgeRows.push({ user_id: userId, badge_id: badgeEvent.badgeId, room_id: roomId, game_id: gameId });
    }
  });

  if (eventRows.length > 0) {
    await admin.from('vm_player_events').insert(eventRows);
  }
  if (badgeRows.length > 0) {
    // on_conflict matches vm_badge_awards' unique(user_id, room_id, badge_id)
    // — belt-and-suspenders alongside the caller-side idempotency guard
    // above, and also covers a badge somehow appearing twice in one
    // player's own badgeEvents (shouldn't happen per evaluateBadges'
    // earnedSet dedup, but costs nothing to be defensive here).
    await admin.from('vm_badge_awards').upsert(badgeRows, { onConflict: 'user_id,room_id,badge_id', ignoreDuplicates: true });
  }

  // ---- Arena layer: results, ratings, personas (migration 0006) ----------
  // Failures here must never undo the game itself, so this block is
  // isolated: the room is already 'finished' and the leaderboard rows above
  // are written before we start.
  try {
    await recordArenaResults(admin, { roomId, gameId, ranked, userIdBySeatIndex, finalState, rngSeed, moves: moves ?? [] });
  } catch (err) {
    console.error('recordArenaResults failed', err);
  }
}

async function recordArenaResults(admin, { roomId, gameId, ranked, userIdBySeatIndex, finalState, rngSeed, moves }) {
  const humanSeats = ranked.filter((r) => userIdBySeatIndex.has(r.seatIndex));
  if (humanSeats.length === 0) return;
  const humanIds = humanSeats.map((r) => userIdBySeatIndex.get(r.seatIndex));

  const { data: ratingRows } = await admin
    .from('vm_ratings')
    .select('user_id, rating, games_played, wins')
    .eq('game_id', gameId)
    .in('user_id', humanIds);
  const ratingByUser = new Map((ratingRows ?? []).map((r) => [r.user_id, r]));

  // Placement from the ranked list (1-based); ties share a placement.
  const placementBySeat = new Map();
  ranked.forEach((r, i) => placementBySeat.set(r.seatIndex, i > 0 && ranked[i - 1].score === r.score ? placementBySeat.get(ranked[i - 1].seatIndex) : i + 1));

  const seatsRanked = ranked.map((r) => {
    const userId = userIdBySeatIndex.get(r.seatIndex);
    return {
      seat: r.seatIndex,
      placement: placementBySeat.get(r.seatIndex),
      human: Boolean(userId),
      rating: userId ? (ratingByUser.get(userId)?.rating ?? 1200) : 1200,
    };
  });
  const newRatings = ratingUpdates(seatsRanked);
  const signals = rngSeed != null ? computeStyleSignals(rngSeed, moves, finalState, humanSeats.map((r) => r.seatIndex)) : new Map();

  const { data: personaRows } = await admin.from('vm_personas').select('*').in('user_id', humanIds);
  const personaByUser = new Map((personaRows ?? []).map((p) => [p.user_id, p]));

  const resultRows = [];
  const ratingUpserts = [];
  const personaUpserts = [];
  for (const r of humanSeats) {
    const userId = userIdBySeatIndex.get(r.seatIndex);
    const before = ratingByUser.get(userId)?.rating ?? 1200;
    const after = newRatings.get(r.seatIndex) ?? before;
    const placement = placementBySeat.get(r.seatIndex);
    const sig = signals.get(r.seatIndex);
    resultRows.push({
      user_id: userId, room_id: roomId, game_id: gameId, placement,
      player_count: ranked.length, human_count: humanSeats.length, score: r.score,
      rating_before: before, rating_after: after, signals: sig ?? {},
    });
    const prev = ratingByUser.get(userId);
    ratingUpserts.push({
      user_id: userId, game_id: gameId, rating: after,
      games_played: (prev?.games_played ?? 0) + 1, wins: (prev?.wins ?? 0) + (placement === 1 ? 1 : 0),
      updated_at: new Date().toISOString(),
    });
    if (sig) {
      const merged = mergePersona(personaByUser.get(userId) ?? null, sig);
      personaUpserts.push({ user_id: userId, ...merged, updated_at: new Date().toISOString() });
    }
  }

  if (resultRows.length) await admin.from('vm_game_results').upsert(resultRows, { onConflict: 'user_id,room_id', ignoreDuplicates: true });
  if (ratingUpserts.length) await admin.from('vm_ratings').upsert(ratingUpserts, { onConflict: 'user_id,game_id' });
  if (personaUpserts.length) await admin.from('vm_personas').upsert(personaUpserts, { onConflict: 'user_id' });
  // Arena Points: everyone at the table earns for playing; the winner earns more.
  for (const row of resultRows) {
    await admin.rpc('vm_award_points', { p_user_id: row.user_id, p_kind: row.placement === 1 ? 'game_won' : 'game_played', p_points: row.placement === 1 ? 25 : 10, p_ref_id: roomId });
  }
}
