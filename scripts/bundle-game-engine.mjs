// Bundles the vendored VentureFlow game engine (supabase/functions/_shared/
// game-engine/entry.js and everything it pulls in, including
// ../data/gameConfig.js) into a single dependency-free ESM file.
//
// ⚠️ THIS IS NOT WHAT'S CURRENTLY DEPLOYED. `bundle.generated.js` is
// currently the small aggregator for engine-parts/part00.js..part13.js — a
// per-file-minified (esbuild `transform()`, never `build()`+bundle, so
// exported identifiers keep their names), never-bundled-together split of
// game-engine/*.js. That shape exists solely because the Supabase
// `deploy_edge_function` MCP tool needs every file for a function
// enumerated in one atomic call and is unreliable on one very large file —
// see bundle.generated.js's own header comment. This script's `build()`
// call instead produces ONE large unminified self-contained file, which
// would silently break that deploy path if it overwrote bundle.generated.js
// without anyone redoing the split+minify+redeploy dance afterward.
//
// game-engine/*.js remains the unmodified, readable source of truth for
// actual game LOGIC changes. If you change it and need to reflect that in
// what's deployed: regenerate engine-parts/*.js by esbuild-`transform()`-
// minifying each source file individually (not bundling), rewrite
// bundle.generated.js's imports to match, run `npm test`, then redeploy all
// files for both functions in one call each via deploy_edge_function.
//
// Safe to run for local reference/inspection (e.g. diffing engine behavior)
// via `BUNDLE_GAME_ENGINE_FORCE=1 npm run build:engine` — it refuses to run
// otherwise so it can't accidentally clobber the real deploy artifact.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (!process.env.BUNDLE_GAME_ENGINE_FORCE) {
  console.error(
    '\nRefusing to run: this would overwrite bundle.generated.js (currently the\n' +
      'live-deployed minified engine-parts/ aggregator) with an unminified,\n' +
      'unrelated single-file bundle. Read this script\'s header comment first.\n' +
      'Set BUNDLE_GAME_ENGINE_FORCE=1 to proceed anyway.\n',
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.join(__dirname, '..', 'supabase', 'functions', '_shared');

await build({
  entryPoints: [path.join(sharedDir, 'game-engine', 'entry.js')],
  outfile: path.join(sharedDir, 'bundle.generated.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  legalComments: 'none',
});

console.log('Bundled game engine -> supabase/functions/_shared/bundle.generated.js');
