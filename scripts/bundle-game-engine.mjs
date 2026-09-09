// Bundles the vendored VentureFlow game engine (supabase/functions/_shared/
// game-engine/entry.js and everything it pulls in, including
// ../data/gameConfig.js) into a single dependency-free, MINIFIED ESM file —
// this IS what's deployed: both resolve-move and sweep-missing-players
// import directly from bundle.generated.js.
//
// (Earlier versions of this file split the engine into
// engine-parts/part00.js..part13.js, one per esbuild `transform()` call,
// because a single earlier deploy attempt with an unminified bundle was
// unreliable through the Supabase `deploy_edge_function` MCP tool. A
// single `build()`+`bundle:true`+`minify:true` pass produces one ~95KB
// file — small enough that the split was unnecessary; the engine-parts/
// folder is retired. If a future deploy of one large file turns out to be
// unreliable again, resurrect the split rather than assuming this comment
// is still accurate.)
//
// Run after any change to game-engine/*.js or data/gameConfig.js (e.g.
// after scripts/sync-game-engine.sh — remember to re-apply the ARENA-ONLY
// patches that script's header describes before running this), then
// `npm test`, then redeploy both functions with bundle.generated.js as
// their only _shared dependency.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'supabase', 'functions', '_shared');

await build({
  entryPoints: [path.join(sharedDir, 'game-engine', 'entry.js')],
  outfile: path.join(sharedDir, 'bundle.generated.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});

console.log('Bundled game engine -> supabase/functions/_shared/bundle.generated.js');
