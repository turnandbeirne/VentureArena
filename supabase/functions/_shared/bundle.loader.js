// Engine loader — DEPLOYED IN PLACE OF bundle.generated.js.
//
// The Supabase MCP deploy tool takes every file inline in one call, and the
// real engine bundle (~96 KB of minified JS) is too large to ship that way
// reliably. So the deployed `_shared/bundle.generated.js` is THIS file: at
// cold start it reads the active engine source for VentureFlow from
// public.vm_game_modules (migration 0008 — service role only), imports it as
// an ES module from a data: URL, and re-exports the same names the real
// bundle exports. gameRoom.ts and arenaSignals.ts import
// './bundle.generated.js' and never know the difference.
//
// This is also the "snap-in" mechanism from the blueprint: a new engine
// version is a row insert + flipping is_active, verified by sha256, with no
// function redeploy. Upload with scripts/upload-game-module.mjs (needs the
// service-role key) or in verified chunks via SQL (see 0008's digest helper).
//
// Locally (node tests, the app's vendored copy) the real bundle is still
// supabase/functions/_shared/bundle.generated.js in the repo — rebuild it
// with `npm run build:engine` after changing game-engine/.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODULE_SLUG = 'ventureflow';

const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const { data, error } = await db
  .from('vm_game_modules')
  .select('version, source, sha256')
  .eq('slug', MODULE_SLUG)
  .eq('is_active', true)
  .single();
if (error || !data?.source) {
  throw new Error(`No active game module for "${MODULE_SLUG}": ${error?.message ?? 'empty source'}`);
}

const bytes = new TextEncoder().encode(data.source);
if (data.sha256) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== data.sha256) throw new Error(`Game module "${MODULE_SLUG}" v${data.version} failed its integrity check`);
}
let binary = '';
for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
const engine = await import(`data:text/javascript;base64,${btoa(binary)}`);

export const gameReducer = engine.gameReducer;
export const seedRng = engine.seedRng;
export const netWorth = engine.netWorth;
export const createNewGame = engine.createNewGame;
export const ONLINE_ROOM_MIN_PLAYERS = engine.ONLINE_ROOM_MIN_PLAYERS;
export const ONLINE_ROOM_MAX_PLAYERS = engine.ONLINE_ROOM_MAX_PLAYERS;
export const ENGINE_VERSION = data.version;
