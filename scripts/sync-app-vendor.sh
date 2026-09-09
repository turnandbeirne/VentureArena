#!/usr/bin/env bash
# Re-copy the READ-ONLY client-side replay copy of the game engine
# (app/src/vendor/) from the canonical vendored source
# (supabase/functions/_shared/game-engine/ + data/gameConfig.js).
#
# Why the app has its own copy at all: the lobby/gameplay UI needs to show
# real game state (whose turn it is, cash, holdings, businesses, log/chat
# feed) without waiting on a server round trip for every OTHER player's
# move. Since game-engine/*.js is already a pure, unmodified,
# browser-safe (state, action) => state function tree (see README.md's "The
# core idea"), the app replays vm_moves through the exact same engine
# client-side purely to DISPLAY state — every actual game ACTION still goes
# through resolve-move, which is and remains the only authority. See
# app/src/lib/replay.js.
#
# Run this any time supabase/functions/_shared/game-engine/ or
# data/gameConfig.js changes (i.e. after scripts/sync-game-engine.sh), so
# the app's copy never silently drifts from what the server actually runs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/supabase/functions/_shared"
DEST="$ROOT/app/src/vendor"

rm -rf "$DEST/game-engine" "$DEST/data"
mkdir -p "$DEST"
cp -r "$SRC/game-engine" "$DEST/game-engine"
mkdir -p "$DEST/data"
cp "$SRC/data/gameConfig.js" "$DEST/data/gameConfig.js"

echo "Synced app/src/vendor/ from supabase/functions/_shared/"
