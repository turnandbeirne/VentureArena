// Exercises the ACTUAL chainResolveAiTurns loop from
// supabase/functions/_shared/gameRoom.ts (not a re-implementation of it)
// against the real bundled game engine, with a minimal in-memory stand-in
// for the Supabase admin client. This is the orchestration logic that isn't
// covered by test-engine-bundle.mjs (which only tests the engine itself) or
// the esbuild syntax check (which doesn't execute anything) — specifically:
// does the loop actually stop when it should, and does it write the right
// number of moves for an all-AI room advancing on its own.
//
// Run with: node scripts/test-ai-chain-resolution.mjs
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'supabase', 'functions', '_shared');

// Node has no Deno global and can't resolve a bare "jsr:" specifier — stub
// both out. Nothing under test (chainResolveAiTurns/replayRoom) calls
// Deno.env or createClient; adminClient()/callerClientFor() just need to
// exist syntactically.
const stubDir = mkdtempSync(path.join(tmpdir(), 'arena-test-'));
const stubPath = path.join(stubDir, 'supabase-js-stub.mjs');
writeFileSync(stubPath, 'export function createClient() { return {}; }\n');

globalThis.Deno = { env: { get: () => 'stub' } };

const outfile = path.join(stubDir, 'gameRoom.bundle.mjs');
await build({
  entryPoints: [path.join(sharedDir, 'gameRoom.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  alias: { 'jsr:@supabase/supabase-js@2': stubPath },
});

const { gameReducer, seedRng, chainResolveAiTurns } = await import(outfile);

// A minimal fake of the two admin.from('moves')... calls chainResolveAiTurns
// actually makes — records every inserted move so we can assert on them.
function makeFakeAdmin() {
  const insertedMoves = [];
  return {
    insertedMoves,
    from(table) {
      if (table === 'vm_moves') {
        return {
          insert: async (row) => {
            insertedMoves.push(row);
            return { error: null };
          },
        };
      }
      // room_seats update chain isn't exercised by chainResolveAiTurns itself
      return { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
    },
  };
}

seedRng(99);
const started = gameReducer(null, {
  type: 'START_GAME',
  mode: {
    type: 'online',
    seats: [
      { type: 'ai', personalityId: 'random' },
      { type: 'ai', personalityId: 'random' },
      { type: 'human', name: 'OnlyHuman' },
    ],
  },
});

// Seat 0 (AI) is active first — chainResolveAiTurns should run seat 0 AND
// seat 1 (also AI) automatically, then STOP as soon as it's the human's
// (seat 2's) turn, without ever touching seat 2.
const admin = makeFakeAdmin();
const finalState = await chainResolveAiTurns(admin, 'fake-room-id', started, 1);

const stoppedOnHuman = finalState.status === 'playing' && finalState.players[finalState.activePlayerIndex].type === 'human';
const onlyAiSeatsRan = admin.insertedMoves.every((m) => m.action.type === 'RUN_AI_TURN');
const seqIsSequential = admin.insertedMoves.every((m, i) => m.seq === i + 1);
const humanSeatNeverActedFor = admin.insertedMoves.every((m) => m.seat_index !== 2);

console.log('Chain stopped exactly when the human seat became active:', stoppedOnHuman ? 'PASS' : 'FAIL');
console.log(`Chain ran ${admin.insertedMoves.length} AI move(s) (seats 0 and 1 only):`, onlyAiSeatsRan && humanSeatNeverActedFor ? 'PASS' : 'FAIL');
console.log('Inserted move seq numbers are sequential starting at 1:', seqIsSequential ? 'PASS' : 'FAIL');

if (!stoppedOnHuman || !onlyAiSeatsRan || !humanSeatNeverActedFor || !seqIsSequential) {
  console.error('finalState.activePlayerIndex/type:', finalState.activePlayerIndex, finalState.players.map((p) => p.type));
  process.exit(1);
}
console.log('\nAI-chain-resolution orchestration test passed.');
