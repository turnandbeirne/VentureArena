// Sanity check for the bundled game engine used by the resolve-move edge
// function: confirms (a) it runs standalone (no VentureFlow app/DOM needed),
// and (b) reseed+replay is actually deterministic — the property the whole
// server-authoritative model depends on. Run with:
//   node scripts/test-engine-bundle.mjs
import { gameReducer, seedRng } from '../supabase/functions/_shared/bundle.generated.js';

function runFixedSequence(seed) {
  seedRng(seed);
  let state = null;
  state = gameReducer(state, {
    type: 'START_GAME',
    mode: { type: 'hotseat', humanCount: 2 },
    humanNames: ['Alice', 'Bob'],
    humanAvatars: [],
    botConfigs: [],
  });
  if (!state || !Array.isArray(state.players) || state.players.length !== 2) {
    throw new Error('START_GAME did not produce a 2-player state');
  }
  const p1 = state.players[0].id;
  const p2 = state.players[1].id;

  state = gameReducer(state, { type: 'BUY_ASSET', playerId: p1, assetId: 'piggy', qty: 1 });
  if (state.lastError) throw new Error('Unexpected error on valid BUY_ASSET: ' + state.lastError);

  state = gameReducer(state, { type: 'END_TURN', playerId: p1 });
  state = gameReducer(state, { type: 'END_TURN', playerId: p2 });

  return state;
}

const a = runFixedSequence(4242);
const b = runFixedSequence(4242);

const fieldsMatch =
  a.month === b.month &&
  JSON.stringify(a.players.map((p) => ({ cash: p.cash, holdings: p.holdings }))) ===
    JSON.stringify(b.players.map((p) => ({ cash: p.cash, holdings: p.holdings })));

if (!fieldsMatch) {
  console.error('FAIL: two replays with the same seed + action sequence diverged.');
  console.error('run A players:', a.players.map((p) => ({ cash: p.cash, holdings: p.holdings })));
  console.error('run B players:', b.players.map((p) => ({ cash: p.cash, holdings: p.holdings })));
  process.exit(1);
}

// Different seed should (overwhelmingly likely) diverge, proving the seed is
// actually being used rather than the engine self-seeding from entropy.
const c = runFixedSequence(1);
const divergedFromDifferentSeed = JSON.stringify(a.players[0].cash) !== JSON.stringify(c.players[0].cash) ||
  JSON.stringify(a.weather) !== JSON.stringify(c.weather);

// Also confirm an invalid action surfaces as lastError, not a thrown
// exception — resolve-move relies on this to reject bad moves cleanly.
seedRng(4242);
let s = gameReducer(null, {
  type: 'START_GAME',
  mode: { type: 'hotseat', humanCount: 2 },
  humanNames: ['Alice', 'Bob'],
  humanAvatars: [],
  botConfigs: [],
});
const p1 = s.players[0].id;
s = gameReducer(s, { type: 'BUY_ASSET', playerId: p1, assetId: 'not-a-real-asset', qty: 1 });

console.log('Determinism (same seed, same actions -> same state):', fieldsMatch ? 'PASS' : 'FAIL');
console.log('Seed actually changes outcomes (different seed -> different state):', divergedFromDifferentSeed ? 'PASS' : 'WARN (check manually)');
console.log('Invalid action surfaces as lastError, not a throw:', s.lastError ? `PASS (${s.lastError})` : 'FAIL');

// ---- 'online' mode: up to ONLINE_ROOM_MAX_PLAYERS (5) mixed human/AI seats,
// the shape the Arena actually uses (see resolve-move/index.ts's
// buildStartAction). Confirms createPlayerRoster's new branch produces one
// player per seat, IN SEAT ORDER, and that array-position == seat_index
// holds regardless of the human/AI mix. ----
seedRng(777);
let onlineState = gameReducer(null, {
  type: 'START_GAME',
  mode: {
    type: 'online',
    seats: [
      { type: 'human', name: 'Priya' },
      { type: 'ai', personalityId: 'random' },
      { type: 'human', name: 'Sam' },
      { type: 'ai', personalityId: 'random' },
      { type: 'ai', personalityId: 'random' },
    ],
  },
  humanAvatars: [],
  botConfigs: [],
});
const rosterOk =
  onlineState.players.length === 5 &&
  onlineState.players[0].type === 'human' &&
  onlineState.players[0].name === 'Priya' &&
  onlineState.players[1].type === 'ai' &&
  onlineState.players[2].type === 'human' &&
  onlineState.players[2].name === 'Sam' &&
  onlineState.players[3].type === 'ai' &&
  onlineState.players[4].type === 'ai' &&
  new Set(onlineState.players.filter((p) => p.type === 'ai').map((p) => p.personalityId)).size === 3; // no duplicate personalities
console.log('5-seat mixed human/AI roster built in seat order:', rosterOk ? 'PASS' : 'FAIL');

// ---- Seat takeover (resign / missing-in-action): a human seat converts to
// AI control mid-game with cash/holdings/etc. untouched. ----
const priyaId = onlineState.players[0].id;
onlineState = gameReducer(onlineState, { type: 'BUY_ASSET', playerId: priyaId, assetId: 'piggy', qty: 2 });
const cashBeforeTakeover = onlineState.players[0].cash;
const holdingsBeforeTakeover = JSON.stringify(onlineState.players[0].holdings);
onlineState = gameReducer(onlineState, { type: 'CONVERT_SEAT_TO_AI', playerId: priyaId });
const takeoverOk =
  onlineState.players[0].type === 'ai' &&
  !!onlineState.players[0].personalityId &&
  onlineState.players[0].cash === cashBeforeTakeover &&
  JSON.stringify(onlineState.players[0].holdings) === holdingsBeforeTakeover &&
  onlineState.players[0].name === 'Priya'; // name stays the human's own, per turnEngine.js's convertSeatToAi
console.log('Seat takeover preserves cash/holdings, flips type to ai:', takeoverOk ? 'PASS' : 'FAIL');

// A now-AI seat should be drivable via RUN_AI_TURN just like any bot seat.
onlineState = gameReducer(onlineState, { type: 'RUN_AI_TURN', playerId: priyaId });
const aiTurnOk = !onlineState.lastError;
console.log('Taken-over seat is drivable via RUN_AI_TURN:', aiTurnOk ? 'PASS' : 'FAIL');

if (!fieldsMatch || !s.lastError || !rosterOk || !takeoverOk || !aiTurnOk) process.exit(1);
console.log('\nAll engine-bundle sanity checks passed.');
