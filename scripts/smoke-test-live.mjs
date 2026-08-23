// Live smoke test against the real deployed Supabase project + edge
// functions. NOT part of the automated test suite (hits real network/DB) —
// run manually: `node scripts/smoke-test-live.mjs`.
//
// Needs normal outbound HTTPS to *.supabase.co. Some sandboxed/agentic
// environments (including the one this was originally written in) proxy or
// block that host by policy — if you see a proxy 403 / connection reset
// instead of real Supabase responses, run this from an unrestricted machine
// (a laptop, CI runner, etc.) instead of debugging it as an app bug.
//
// Exercises the actual end-to-end path a real app would: anonymous sign-in,
// inserting vm_rooms/vm_room_seats through PostgREST (so RLS is genuinely
// enforced, not bypassed), then driving a real room through resolve-move —
// START_GAME, a couple of human turns, AI-turn auto-chaining, and a
// voluntary resign (CONVERT_SEAT_TO_AI) — reading everything back from
// vm_moves at the end to confirm the persisted log matches what the
// function returned.

const SUPABASE_URL = 'https://iwpysmrmunirsvdrecmw.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3cHlzbXJtdW5pcnN2ZHJlY213Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNzQwOTgsImV4cCI6MjEwMjc1MDA5OH0.R8SaEFgk3hdtDVvNSLyur7jXtGEcnr-s-ge2myKf_40';

let failures = 0;
function check(label, cond, extra) {
  if (cond) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? '');
  }
}

async function anonSignIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`anon sign-in failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { token: body.access_token, userId: body.user.id };
}

function restHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function rest(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = restHeaders(token);
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`REST ${method} ${path} -> ${res.status}: ${text}`);
  return json;
}

async function resolveMove(token, roomId, action) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/resolve-move`, {
    method: 'POST',
    headers: restHeaders(token),
    body: JSON.stringify({ roomId, action }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`resolve-move ${action.type} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  console.log('1. Anonymous sign-in for two guest players...');
  const host = await anonSignIn();
  const guest2 = await anonSignIn();
  check('host got a session', !!host.token);
  check('second player got a session', !!guest2.token);
  console.log(`   host=${host.userId} guest2=${guest2.userId}`);

  console.log('2. Look up the ventureflow game row...');
  const games = await rest('vm_games?slug=eq.ventureflow&select=id', { token: host.token });
  check('ventureflow game exists', games.length === 1, games);
  const gameId = games[0].id;

  console.log('3. Host creates a room...');
  const rooms = await rest('vm_rooms', {
    method: 'POST',
    token: host.token,
    prefer: 'return=representation',
    body: { game_id: gameId, host_id: host.userId },
  });
  check('room created', rooms.length === 1, rooms);
  const room = rooms[0];
  console.log(`   room=${room.id} seed=${room.rng_seed} invite=${room.invite_code}`);

  console.log('4. Host seats: seat0=host(human), seat1=guest2(human), seat2=AI...');
  await rest('vm_room_seats', {
    method: 'POST',
    token: host.token,
    prefer: 'return=representation',
    body: [
      { room_id: room.id, seat_index: 0, user_id: host.userId },
      { room_id: room.id, seat_index: 1, user_id: guest2.userId },
      { room_id: room.id, seat_index: 2, bot_personality_id: 'random' },
    ],
  });
  const seats = await rest(`vm_room_seats?room_id=eq.${room.id}&select=*&order=seat_index`, { token: host.token });
  check('3 seats persisted', seats.length === 3, seats);

  console.log('5. START_GAME as host...');
  let result = await resolveMove(host.token, room.id, { type: 'START_GAME' });
  let state = result.state;
  check('state has 3 players', state.players?.length === 3, state.players);
  check('players map onto seats: p0 human, p1 human, p2 ai', state.players[0].type === 'human' && state.players[1].type === 'human' && state.players[2].type === 'ai', state.players.map((p) => p.type));
  check('game status is playing', state.status === 'playing', state.status);
  check('active player is seat 0 (host) first', state.activePlayerIndex === 0, state.activePlayerIndex);

  console.log('6. Host END_TURN (seat0 -> seat1, both human, no AI chain expected)...');
  result = await resolveMove(host.token, room.id, { type: 'END_TURN' });
  state = result.state;
  check('active player advanced to seat 1', state.activePlayerIndex === 1, state.activePlayerIndex);
  check('seat 2 (AI) did NOT get auto-played yet', state.players[2].type === 'ai', state.players[2].type);

  console.log('7. Guest2 END_TURN (seat1 -> should trigger AI auto-chain through seat2 -> back to seat0)...');
  result = await resolveMove(guest2.token, room.id, { type: 'END_TURN' });
  state = result.state;
  check('active player wrapped back to seat 0 after AI seat auto-played', state.activePlayerIndex === 0, state.activePlayerIndex);

  console.log('8. Confirm AI turn actually got persisted as its own vm_moves row...');
  const movesAfterAi = await rest(`vm_moves?room_id=eq.${room.id}&select=seq,seat_index,action&order=seq`, { token: host.token });
  const aiMoveRows = movesAfterAi.filter((m) => m.seat_index === 2);
  check('at least one move recorded for AI seat 2', aiMoveRows.length >= 1, movesAfterAi.map((m) => `${m.seq}:${m.seat_index}:${m.action.type}`));

  console.log('9. Host resigns (CONVERT_SEAT_TO_AI on their own seat) while active...');
  result = await resolveMove(host.token, room.id, { type: 'CONVERT_SEAT_TO_AI' });
  state = result.state;
  check('seat 0 is now AI-controlled', state.players[0].type === 'ai', state.players[0].type);
  check('cash/holdings preserved across takeover (non-null cash)', typeof state.players[0].cash === 'number', state.players[0].cash);

  console.log('10. Confirm resolve-move synced bot_personality_id back onto vm_room_seats for seat 0...');
  const seatsAfterResign = await rest(`vm_room_seats?room_id=eq.${room.id}&select=*&order=seat_index`, { token: host.token });
  const seat0 = seatsAfterResign.find((s) => s.seat_index === 0);
  check('seat0.bot_personality_id got set after takeover', !!seat0.bot_personality_id, seat0);
  check('seat0.user_id is still the original host (ownership preserved)', seat0.user_id === host.userId, seat0);

  console.log('11. Rejection check: guest2 tries to act out of turn...');
  let rejected = false;
  try {
    await resolveMove(guest2.token, room.id, { type: 'END_TURN' });
  } catch (err) {
    rejected = /not your turn/i.test(String(err.message)) || /409/.test(String(err.message));
  }
  check('out-of-turn action was rejected', rejected);

  console.log('12. Rejection check: an action type not in the client-submittable set...');
  let rejected2 = false;
  try {
    await resolveMove(host.token, room.id, { type: 'LOAD_GAME', state: {} });
  } catch (err) {
    rejected2 = /400/.test(String(err.message)) || /not client-submittable/i.test(String(err.message));
  }
  check('LOAD_GAME (server-internal action type) was rejected from a client call', rejected2);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — room ${room.id}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SMOKE TEST CRASHED:', err);
  process.exit(1);
});
