#!/usr/bin/env bash
# Re-vendor the pure game engine from a local checkout of the VentureFlow
# repo into supabase/functions/_shared/game-engine/ (shared by every Edge
# Function that runs the engine — resolve-move, sweep-missing-players). Run
# this whenever VentureFlow's game logic changes, then `npm run build:engine`
# before redeploying.
#
# ⚠️ THIS OVERWRITES 4 ARENA-ONLY PATCHES that don't exist in upstream
# VentureFlow (online-mode player-roster building + seat-to-AI conversion —
# search this repo for "ARENA-ONLY" to find every one):
#   - data/gameConfig.js:        ONLINE_ROOM_MIN_PLAYERS / MAX_PLAYERS
#   - game-engine/players.js:    `export` on resolveBotConfig, and the whole
#                                 `mode.type === 'online'` branch in
#                                 createPlayerRoster
#   - game-engine/turnEngine.js: the resolveBotConfig import, and the whole
#                                 convertSeatToAi() function
#   - game-engine/reducer.js:    the convertSeatToAi import and the
#                                 'CONVERT_SEAT_TO_AI' case
# After running this script, `git diff` will show all of the above vanish —
# re-apply them by hand (or `git checkout -p` the relevant hunks back in)
# before running `npm run build:engine` / redeploying. There's no automated
# re-apply script; the ARENA-ONLY comments are there so a manual diff makes
# it obvious what to restore.
#
# Usage: ./scripts/sync-game-engine.sh /path/to/ventureflow
set -euo pipefail

SRC="${1:?Usage: sync-game-engine.sh /path/to/ventureflow}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/functions/_shared"

# Files this engine actually needs to run gameReducer() headlessly. Excludes
# persistence.js / leaderboard.js / profile.js / insights.js / wealthPile.js —
# those are client-only (localStorage, chart formatting) and are never
# imported by reducer.js's own dependency chain. If VentureFlow's reducer.js
# starts importing something new, add it to this list.
FILES=(
  actions.js aiEngine.js badges.js businessExits.js businessUpgrades.js
  chatEngine.js dailyChallenge.js decks.js market.js nameFilter.js
  newGame.js players.js reducer.js rng.js scenarios.js turnEngine.js
  lessons.js weather.js turnClock.js
)

for f in "${FILES[@]}"; do
  cp "$SRC/src/game/$f" "$DEST/game-engine/$f"
done
cp "$SRC/src/data/gameConfig.js" "$DEST/data/gameConfig.js"

echo "Synced $(echo "${FILES[@]}" | wc -w) engine files + gameConfig.js from $SRC"
echo "Next: npm run build:engine, then redeploy resolve-move and sweep-missing-players."
