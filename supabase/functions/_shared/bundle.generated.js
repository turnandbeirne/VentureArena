// GENERATED + MINIFIED — do not hand-edit. This is the aggregator that ties
// together supabase/functions/_shared/engine-parts/part00.js..part13.js
// (each an individually esbuild-`transform()`-minified — never bundled —
// slice of ../game-engine/*.js + ../data/gameConfig.js). `transform()` per
// file (not `build()` with bundle:true) is deliberate: it shrinks each file
// without renaming its exported/imported identifiers, so the cross-file
// import/export contracts between the parts still line up byte-for-byte.
// This split-into-many-small-files shape exists ONLY to satisfy the
// Supabase `deploy_edge_function` MCP tool, which requires every file for a
// function in one atomic call and is unreliable on very large single-file
// payloads — see scripts/bundle-game-engine.mjs's header comment before
// regenerating anything here.
import{ONLINE_ROOM_MAX_PLAYERS as o,ONLINE_ROOM_MIN_PLAYERS as m}from"./engine-parts/part00.js";import{seedRng as O}from"./engine-parts/part06.js";import{createNewGame as _}from"./engine-parts/part08.js";import{gameReducer as f}from"./engine-parts/part13.js";export{o as ONLINE_ROOM_MAX_PLAYERS,m as ONLINE_ROOM_MIN_PLAYERS,_ as createNewGame,f as gameReducer,O as seedRng};
