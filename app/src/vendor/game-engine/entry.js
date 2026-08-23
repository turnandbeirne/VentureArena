// ============================================================================
// Bundling entry point, shared by every Edge Function that needs to run the
// game engine (resolve-move, sweep-missing-players).
// ----------------------------------------------------------------------------
// This file is the ONLY thing added on top of the vendored VentureFlow
// engine files in this folder — every other file here (actions.js,
// reducer.js, turnEngine.js, rng.js, ...) is an unmodified copy straight out
// of the VentureFlow repo's src/game/ folder (see ../../../../scripts/
// sync-game-engine.sh). Deno needs explicit-extension imports and Supabase
// Edge Functions deploy more reliably as a single self-contained file than as
// a tree of bare-specifier ESM imports, so `npm run build:engine` (see
// ../../../../scripts/bundle-game-engine.mjs) bundles everything reachable
// from here into ../bundle.generated.js, which every function imports.
//
// Re-sync this folder from VentureFlow whenever the game engine changes, then
// re-run the bundle script before redeploying either function.
// ============================================================================
export { gameReducer } from './reducer.js';
export { seedRng } from './rng.js';
export { createNewGame } from './newGame.js';
export { ONLINE_ROOM_MIN_PLAYERS, ONLINE_ROOM_MAX_PLAYERS } from '../data/gameConfig.js';
