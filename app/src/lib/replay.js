// Client-side, READ-ONLY replay — mirrors supabase/functions/_shared/
// gameRoom.ts's replayRoom() exactly (reseed the RNG from the room's fixed
// rng_seed, then fold every persisted move through gameReducer in order).
// This exists purely so the UI can show live game state — whose turn it is,
// cash, holdings, businesses, the log/chat feed — without a server round
// trip for every move another player (or an AI) makes. It NEVER decides
// anything: every actual action still goes through the resolve-move edge
// function, which replays independently server-side and is the only thing
// that ever gets to say what really happened. If a client's local replay
// disagreed with the server, the server's next resolve-move response (or
// the next real-time-pushed move) is what wins — this is a display
// convenience, not a second source of truth.
import { gameReducer } from '../vendor/game-engine/reducer.js';
import { seedRng } from '../vendor/game-engine/rng.js';

/** moves: array of { seq, action }, already ordered by seq ascending. */
export function replayRoom(rngSeed, moves) {
  seedRng(rngSeed);
  let state = null;
  for (const move of moves) {
    state = gameReducer(state, move.action);
  }
  return state;
}
