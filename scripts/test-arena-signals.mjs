// Drives a full online VentureFlow game (2 humans + 1 AI) through the bundled
// engine, building the same {seat_index, action, created_at} move log that
// vm_moves holds, then checks that the Arena layer's style signals, persona
// label, and rating updates come out sane. Run with:
//   node --experimental-strip-types scripts/test-arena-signals.mjs
import { gameReducer, seedRng, netWorth } from '../supabase/functions/_shared/bundle.generated.js';
import { computeStyleSignals, mergePersona, personaLabel, ratingUpdates } from '../supabase/functions/_shared/arenaSignals.ts';

const SEED = 777;
const moves = [];
let clock = Date.parse('2026-09-09T12:00:00Z');
function push(seatIndex, action, secondsLater) {
  clock += (secondsLater ?? 20) * 1000;
  moves.push({ seq: moves.length, seat_index: seatIndex, action, created_at: new Date(clock).toISOString() });
}

seedRng(SEED);
const startAction = {
  type: 'START_GAME',
  mode: { type: 'online', seats: [{ type: 'human', name: 'Maya' }, { type: 'human', name: 'Dev' }, { type: 'ai' }] },
};
push(0, startAction, 0);
let state = gameReducer(null, startAction);
const ids = state.players.map((p) => p.id);

function apply(seatIndex, action, secondsLater) {
  const full = { ...action, playerId: ids[seatIndex] };
  const next = gameReducer(state, full);
  if (next.lastError) return false;
  push(seatIndex, full, secondsLater);
  state = next;
  return true;
}

// Play until game over: Maya = fast risk-taker (treasure + business), Dev = slow saver (piggy only).
let guard = 0;
while (state.status !== 'gameover' && guard++ < 2000) {
  if (state.status === 'playing') {
    const seat = state.activePlayerIndex;
    const p = state.players[seat];
    if (p.type === 'ai') {
      const a = { type: 'RUN_AI_TURN', playerId: p.id };
      state = gameReducer(state, a);
      push(seat, a, 2);
      continue;
    }
    if (seat === 0) {
      if (state.month <= 2) apply(0, { type: 'START_BUSINESS', name: 'Maya Co' }, 15);
      apply(0, { type: 'BUY_ASSET', assetId: 'treasure', qty: 1 }, 10);
      apply(0, { type: 'END_TURN' }, 15);
    } else {
      apply(1, { type: 'BUY_ASSET', assetId: 'piggy', qty: 2 }, 200);
      apply(1, { type: 'END_TURN' }, 400);
    }
  } else if (state.status === 'exitOffer') {
    const seat = state.players.findIndex((p) => p.id === state.pendingExitOffer?.playerId);
    apply(seat, { type: 'RESOLVE_EXIT_OFFER', accept: seat === 1 }, 30);
  } else if (state.status === 'monthRecap') {
    const a = { type: 'ACK_FORTUNE_CARD' };
    state = gameReducer(state, a);
    push(0, a, 1);
  } else if (state.status === 'gameEnding') {
    const a = { type: 'FINALIZE_GAME_OVER' };
    state = gameReducer(state, a);
    push(0, a, 1);
  } else {
    throw new Error('unhandled status ' + state.status);
  }
}
if (state.status !== 'gameover') throw new Error('game did not finish, status=' + state.status + ' month=' + state.month);

const signals = computeStyleSignals(SEED, moves, state);
const maya = signals.get(0);
const dev = signals.get(1);
console.log('Maya', maya, personaLabel(maya));
console.log('Dev ', dev, personaLabel(dev));

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }
assert(maya && dev, 'signals for both humans');
assert(maya.risk > dev.risk, 'treasure buyer is riskier than piggy buyer');
assert(maya.speed > dev.speed, 'fast mover scores higher on speed');
assert(maya.horizon > dev.horizon, 'business builder has longer horizon');
assert(!signals.has(2), 'no signals for the AI seat');
assert(mergePersona(null, maya).games_counted === 1, 'mergePersona counts games');
const merged = mergePersona({ ...dev, games_counted: 3 }, maya);
assert(merged.games_counted === 4 && merged.risk > dev.risk && merged.risk < maya.risk, 'running mean stays between');

const ranked = state.players.map((p, seat) => ({ seat, score: netWorth(p, state.assetPrices) })).sort((a, b) => b.score - a.score);
const seatsRanked = ranked.map((r, i) => ({ seat: r.seat, placement: i + 1, human: r.seat !== 2, rating: 1200 }));
const ratings = ratingUpdates(seatsRanked);
console.log('placements', seatsRanked.map((s) => `${s.seat}:#${s.placement}`).join(' '), 'ratings', [...ratings.entries()]);
const winner = seatsRanked.find((s) => s.placement === 1);
const loserHuman = seatsRanked.find((s) => s.human && s.placement === Math.max(...seatsRanked.filter((x) => x.human).map((x) => x.placement)));
assert(!ratings.has(2), 'AI seat gets no rating');
if (winner.human) assert(ratings.get(winner.seat) > 1200, 'human winner gains rating');
assert(ratings.get(loserHuman.seat) < 1200 || loserHuman.seat === winner.seat, 'human loser loses rating');
console.log('OK: arena signals, personas, and ratings behave as expected over', moves.length, 'moves');
