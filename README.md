# VentureMaker Arena

A generic, game-agnostic multiplayer platform for VentureMaker games, built on
Supabase. VentureFlow is the first game plugged into it. The shared Supabase
project is `opportunity-engines-platform` (id `iwpysmrmunirsvdrecmw`) — it also
hosts unrelated live business data, which is why every object this repo owns
is `vm_`-prefixed (see `0001_init.sql`'s header) and the deploy boundary is
scoped to exactly `vm_*` tables + the `resolve-move` / `sweep-missing-players`
functions.

**Current status: live and verified end-to-end.** Schema (migrations
0001-0003), both edge functions (`resolve-move` v27, `sweep-missing-players`
v3), and the full app — auth, lobby (create/join rooms, seat claiming), and a
realtime gameplay screen — are deployed and confirmed working against the
real project. The app is hosted on Railway at
`arena-web-production-6e64.up.railway.app`, built from this repo's `main`
branch (root directory `app`). A full live run was driven through a real
browser against the real deployed app: email sign-up + confirmation, guest
sign-in (once anonymous auth was enabled — see below), room creation with an
AI seat, `START_GAME`, buying assets, ending a turn, AI-chain resolution,
fortune-card interstitials, and voluntary resign-to-AI (`CONVERT_SEAT_TO_AI`)
with cash/net-worth/businesses preserved across the takeover — all confirmed
working live, no console errors. See "Known gaps" for what's still open.

Design rationale, the decisions that led here, and the full architecture
writeup live in the VentureFlow project's roadmap doc
(`roadmap-replayability-and-multiplayer.md`) — this README is the
implementation-facing companion to that.

## What's in here

```
supabase/
  migrations/
    0001_init.sql                  -- vm_profiles, vm_games, vm_friendships, vm_rooms,
                                       vm_room_seats, vm_moves + RLS policies
    0002_room_size_and_takeover.sql -- turn_timeout_hours + the seat-occupant
                                       constraint change a takeover needs
    0003_seat_claiming.sql          -- lets a non-host user claim/vacate an
                                       open seat — 0001's seat policy was
                                       host-only, so nobody else could ever
                                       join a room until this
  functions/
    _shared/
      gameRoom.ts                  -- replay, AI-chain resolution, Supabase
                                       client helpers — shared by both functions
      game-engine/                 -- VentureFlow's pure game logic, vendored
                                       UNMODIFIED (see below) — the readable
                                       source of truth for game LOGIC changes
      data/gameConfig.js           -- vendored alongside it
      engine-parts/                -- what's ACTUALLY deployed: game-engine/*
                                       + gameConfig.js, split into per-file
                                       esbuild-`transform()`-minified chunks
                                       (never bundled, so cross-file
                                       import/export names survive intact) —
                                       purely to fit the Supabase
                                       deploy_edge_function tool's one-atomic-
                                       call, large-payload-unreliable
                                       constraints. Do not hand-edit.
      bundle.generated.js          -- generated aggregator re-exporting from
                                       engine-parts/; do not hand-edit (see
                                       bundle.generated.js's own header and
                                       scripts/bundle-game-engine.mjs before
                                       regenerating either)
    resolve-move/
      index.ts                     -- the ONE authoritative "advance a room's
                                       game state" endpoint
    sweep-missing-players/
      index.ts                     -- scheduled: hands a stalled human seat to
                                       an AI stand-in (see "Missing in action" below)
scripts/
  sync-game-engine.sh              -- re-vendor game-engine/ from a VentureFlow checkout
  bundle-game-engine.mjs           -- rebuilds an unminified single-file bundle from
                                       game-engine/ for local reference ONLY — guarded
                                       against overwriting the real deploy artifact by
                                       accident; see its header comment
  test-engine-bundle.mjs           -- engine determinism + roster/takeover sanity checks
  test-ai-chain-resolution.mjs     -- exercises the real AI-chain-resolution loop
  smoke-test-live.mjs              -- live end-to-end check against the real deployed
                                       project (guest sign-in, room, START_GAME, AI-turn
                                       chaining, resign) — see its header for how to run it
app/                                -- Arena web app: sign up / sign in / guest, lobby
                                       (create/join rooms, seat management), and a
                                       realtime gameplay screen
```

## The core idea

`game-engine/` is a byte-for-byte copy of VentureFlow's `src/game/*.js` +
`src/data/gameConfig.js` — `reducer.js`, `turnEngine.js`, `actions.js`,
`rng.js`, etc., **completely unmodified**. Nothing needed to change, because
none of it touches the DOM or the browser — it's already a pure
`(state, action) => state` function tree. That's what makes running it
server-side possible without a rewrite.

A room's current game state is never stored directly. Every call to
`resolve-move` (or `sweep-missing-players`) rebuilds it by:
1. Reseeding VentureFlow's RNG from `vm_rooms.rng_seed` (fixed once, at room
   creation).
2. Replaying every prior move for that room, in order, through `gameReducer`.
3. Applying the new action on top.

Because the RNG is a seeded, deterministic generator (see `rng.js`'s own
module comment), step 1+2 reproduce every random roll — weather, fortune
cards, price drift — bit-for-bit, every time. `scripts/test-engine-bundle.mjs`
verifies this property directly (same seed + same actions → identical
resulting state; different seed → different state), plus that a 5-seat mixed
roster builds correctly and a resign/takeover preserves cash/holdings.
`scripts/test-ai-chain-resolution.mjs` separately exercises the real
`chainResolveAiTurns` orchestration loop (not a re-implementation of it)
against a mocked database, confirming it runs every consecutive AI seat and
stops exactly on the first human seat. Run both any time you re-sync the
engine:

```
npm run build:engine
node scripts/test-engine-bundle.mjs
node scripts/test-ai-chain-resolution.mjs
```

## Why this closes the anti-cheat gap

Today, VentureFlow's action functions are plain client-side state transforms
— any client can claim any outcome. `resolve-move` is the only thing allowed
to write to the `vm_moves` table (enforced by RLS + the service-role key — see
the comment on that table in `0001_init.sql`), and before it touches state it:

- resolves the caller's *seat* from their authenticated Supabase user id (not
  from anything the client claims),
- derives their *player id* from the replayed state (not from the request
  body),
- rejects the action if it's not that seat's turn,
- and only ever runs the action through the real, unmodified game engine.

A client can request a move. Only the server decides what actually happened.

## Room size: up to 5 seats, any human/AI mix

VentureFlow's `createPlayerRoster()` (in `players.js`) has a new `mode.type:
'online'` branch built for exactly this: `mode.seats` is an ordered list of
`{ type: 'human', name, avatar }` or `{ type: 'ai', personalityId,
skillLevelId }` entries, 2-5 of them (`ONLINE_ROOM_MIN_PLAYERS`/
`ONLINE_ROOM_MAX_PLAYERS` in `gameConfig.js`), and `players[i]` always
corresponds to `mode.seats[i]` — which is exactly what lets `resolve-move`
map a room's `vm_room_seats.seat_index` straight onto a player id with no extra
bookkeeping. `resolve-move`'s `START_GAME` handler builds this seat list from
the room's actual `vm_room_seats` rows (never from anything the client sends),
so a room can be all-human, all-AI, or anything in between.

## Resign, and missing-in-action takeover

Two ways a human seat can end up AI-controlled mid-game, both landing on the
same engine primitive — `turnEngine.js`'s `convertSeatToAi(state, playerId,
options)` — which flips `type`/`personalityId`/`strategyId`/`skillLevelId`
and leaves **everything else** (cash, holdings, businesses, badges, ledger,
net-worth history) completely untouched, so the handover is seamless rather
than a reset:

1. **Voluntary resign.** A player submits `CONVERT_SEAT_TO_AI` through
   `resolve-move` like any other action — the server only ever lets you
   convert your *own* seat (the same "derive playerId from the caller's seat,
   never trust the request" check every other action gets).
2. **Automatic, on a timeout.** `sweep-missing-players` is a scheduled
   function (not user-invoked — see `INSTRUCTIONS.md` for wiring up the
   schedule) that checks every `active` room: if it's been silent longer than
   that room's `vm_rooms.turn_timeout_hours` (default 48, set at room creation),
   it figures out who's actually blocking the game — the active player, or
   whoever a pending exit-offer decision is waiting on — and if that's a
   still-human seat, converts it the exact same way.

Either path immediately runs `chainResolveAiTurns` afterward (shared by both
functions — see `_shared/gameRoom.ts`), so if the newly-AI seat's turn is
next, it doesn't sit waiting — the bot just plays, right away, same as any
other AI turn.

`vm_room_seats.bot_personality_id` gets kept in sync as a **display cache**
whenever a seat becomes AI-controlled (original bot seat or takeover) —
purely so a lobby/UI can show "Alice — now played by Bossemby" without
replaying the whole move log. It's never read to make a resolve-move
decision; the replayed game state is always the authority.

## Ported from VentureFlow standalone: Teach Me mode, business naming, real recap email

Brought over from the standalone VentureFlow build (see
`vf-source-snapshot-2026-08-23.md`, `round-6-fun-education-kids-fix.md`,
`round-7-teach-me-mode.md` in the VentureFlow project) on top of the
already-ported gameplay UI described above:

- **Business naming.** `StartBusinessModal.jsx` (new) — pick a suggested name
  (with a live storefront-art preview) or type your own before a business
  actually starts. `ArenaGameBoard`'s Start Business button opens it;
  confirming calls `game.startBusiness(myPlayer.id, name)`, which
  `useOnlineGame` submits as `{ type: 'START_BUSINESS', name }` — the engine
  already reads `action.name` (see `game-engine/reducer.js` and
  `actions.js`'s `startBusiness`), so this needed no server-side change once
  the engine was re-synced.
- **"Teach Me" mode.** `game/teachMode.js` + `hooks/useTeachMode.js` (a
  device-preference store, not game state) + `components/LessonTip.jsx` — a
  🎓 toggle in the board header turns on ❓ tooltips next to asset cards, the
  weather badge, the two ActionBar buttons, fortune cards, and a business's
  upgrade chips, each explaining the real financial idea behind that part of
  the game. Off by default; renders nothing extra when off.
- **Shareable recap link + real email.** `game/recapShare.js` encodes a
  finished game's standings/concepts/insights straight into a URL fragment —
  no backend, no expiry — decoded by `components/RecapViewer.jsx`, mounted at
  the static `/recap` route (see `main.jsx`, and `app/vercel.json` /
  `app/public/_redirects` for the SPA-rewrite config a direct load of that
  path needs on most static hosts — Railway's `serve -s` already handles
  this without extra config). `GameOverScreen`'s "Share with a parent or
  teacher" row has both "Copy Recap Link" and an "Email Recap" send. Email
  is a REAL send, not `mailto:` (which silently does nothing without a
  configured mail client — that was the standalone bug this fixes): it POSTs
  to a new public Edge Function, **`send-recap-email`**
  (`supabase/functions/send-recap-email/index.ts`), which calls Resend's API
  from a `venturemaker.org` address. See that file's own header comment for
  the abuse-surface reasoning (it can only ever mail one canned template to
  an address the caller supplies, linking to this app's own `/recap` page —
  never arbitrary content).
  - **Setup required before this actually sends anything:** a Resend
    account, `venturemaker.org` verified as a sending domain there (Resend
    gives you the DNS records), and an API key set as this project's
    `RESEND_API_KEY` secret — `supabase secrets set RESEND_API_KEY=re_xxx
    --project-ref iwpysmrmunirsvdrecmw`, or via the Supabase dashboard
    (Project Settings → Edge Functions → Secrets). Until that's done, the
    function returns a clear "not set up yet" error and the button surfaces
    it inline, suggesting Copy Recap Link instead. Optionally set
    `RESEND_FROM_ADDRESS` too, to change the sender without a redeploy.
- **Unlocks data (avatars/themes) carried over, not yet wired to any Arena
  UI.** `data/gameConfig.js`'s `PLAYER_AVATARS` (8→24), `AVATAR_UNLOCKS`, and
  `BOARD_THEMES` (2→6) were re-synced in along with everything else, but
  Arena has no `profile.js`/theme-picker of its own — identity here is a
  real account (`vm_profiles`), not a browser's `localStorage`. Wiring these
  up for real means a per-account unlocks table, not a straight port of the
  client-only version; left for later, as noted in
  `vf-source-snapshot-2026-08-23.md`.
- **Engine re-sync note:** re-vendoring from VentureFlow
  (`scripts/sync-game-engine.sh`) wipes 4 ARENA-ONLY patches every time (see
  that script's own header) — they were re-applied by hand this round and
  verified byte-identical to the pre-sync copy via `diff`, then
  `scripts/sync-app-vendor.sh` + `node scripts/bundle-game-engine.mjs`
  brought the client vendor copy and the deployed `bundle.generated.js`
  back in sync. `scripts/test-engine-bundle.mjs` and
  `scripts/test-ai-chain-resolution.mjs` both still pass.

## Round 9: per-asset history chart, a real ending instead of a hard cut, corrected recap sender

Three changes, ported into both apps' engine (`game-engine/{players,turnEngine,reducer,newGame}.js`
in both `supabase/functions/_shared/` and `app/src/vendor/`) plus this app's UI:

- **`send-recap-email`'s sender corrected to `build@venturemaker.org`**
  (Michael confirmed `venturemaker.org` is Resend-verified with that as the
  mailfrom, not `recap@venturemaker.org` as originally guessed) — redeployed
  as version 3.
- **Per-asset price/cashflow history.** `turnEngine.js`'s `finishMonthEnd`
  now also appends a `{month, price, cashflow}` snapshot per asset per
  completed month into `state.assetHistory[assetId]` — same one-point-per-
  finished-month convention as `player.netWorthHistory`. "Cashflow" is
  `perUnitIncome()` (already used by `AssetShop.jsx` for "current per-unit
  income") — asset-intrinsic, not dependent on who owns it. A new "📊
  History" button on every asset card opens **`AssetHistoryModal.jsx`**
  (new): two small single-series SVG charts (price, then cashflow) mirroring
  `NetWorthChart.jsx`'s hand-rolled house style — per the dataviz skill,
  price and cashflow are different scales, so they're two charts, never one
  dual-axis chart. Works identically for a live game (appends the
  in-progress month's live price/cashflow as the latest point) and for the
  read-only board after game over.
- **A real ending instead of a hard cut to the leaderboard.** Previously the
  FINAL month's `finishMonthEnd` jumped `status` straight to `'gameover'`,
  which skipped `'monthRecap'` entirely — so that month's fortune cards were
  drawn but never shown (`GameBoard`/`ArenaGameBoard` only render the
  fortune-card modal during `'monthRecap'`). Now every month, final one
  included, always goes to `'monthRecap'` first; a new `pendingGameOver`
  flag (set by `finishMonthEnd`, read by `acknowledgeFortuneCard`) sends the
  player to a new `'gameEnding'` status instead of `'playing'` once the
  final month's cards are dismissed — a short "That's a wrap!" countdown
  (`GAME_ENDING_COUNTDOWN_SECONDS`, `data/gameConfig.js`) before the actual
  Game Over screen, with a "See Final Results Now" skip button. A new
  `finalizeGameOver()` (`turnEngine.js`) + `'FINALIZE_GAME_OVER'` reducer
  case ends the pause. **Arena-specific wiring:** `FINALIZE_GAME_OVER` was
  added to `resolve-move`'s client-submittable action allowlist (redeployed
  as version 29); unlike `ACK_FORTUNE_CARD`, it needs no elected-single-
  client rule in `ArenaGameBoard.jsx` because `finalizeGameOver()` is a pure
  no-op once status is already `'gameover'` — every connected client's own
  countdown can safely submit it. `sweep-missing-players` was also
  redeployed (version 5) with the same refreshed `bundle.generated.js`
  purely to keep its own `replayRoom()` on the same engine version as
  `resolve-move` — both functions replay the same `vm_moves` history through
  `gameReducer`, so letting them drift onto different engine versions would
  risk divergent replayed state, not just a missing feature.
  "🗺️ View Game Board" (`GameOverScreen.jsx`) reopens the same board
  read-only afterward (`ArenaGameBoard`'s `showBoardAfterGameOver` /
  standalone `App.jsx`'s `showBoardAfterGameOver`), with "← Back to Recap"
  to return.
- **Verification:** a throwaway script drove a full 24-month game through
  the bundled engine (`supabase/functions/_shared/bundle.generated.js`)
  end-to-end, confirming the final month shows `'monthRecap'`, the game
  passes through `'gameEnding'`, `assetHistory` has exactly 24 entries per
  asset, and firing `FINALIZE_GAME_OVER` twice in a row (simulating two
  racing clients) is harmless. `scripts/test-engine-bundle.mjs` and
  `scripts/test-ai-chain-resolution.mjs` still pass; `npm run build` is
  clean in both `app/` and the VentureFlow standalone repo.

## Round 10: the "that's a wrap" screen became a real recap dashboard

Round 9 gave the end of a game a pause instead of a hard cut — a plain "that's
a wrap" countdown that auto-advanced after 5 seconds. This round replaces that
countdown with a browsable recap, ported into both apps' engine
(`game-engine/{players,turnEngine}.js` in both `supabase/functions/_shared/`
and `app/src/vendor/`) plus both apps' UI.

- **Three new permanent per-player history arrays**, same one-point-per-
  completed-month convention as the existing `netWorthHistory`:
  `passiveIncomeHistory` (`[{month, passiveIncome}]`, `passiveIncomeBreakdown`'s
  total — business + asset income + card bonus, NOT allowance),
  `totalIncomeHistory` (`[{month, income}]`, that month's full Payday total —
  allowance + the above), and `fortuneCardHistory` (`[{month, deckId, card,
  description}]`, every fortune card a player has EVER drawn). All three are
  appended in `turnEngine.js`'s `finishMonthEnd`, right alongside the payday
  and fortune-card steps that already compute these numbers, so there's no
  second calculation to keep in sync. `fortuneCardHistory` is deliberately
  separate from `state.fortuneRecap` — that array is cleared every month once
  its cards are viewed (it drives the one-at-a-time popup during play), so by
  the time a game reaches `'gameEnding'` it's already empty; `fortuneCardHistory`
  is permanent, purely for this recap.
- **`MiniLineChart.jsx` extracted** from `AssetHistoryModal.jsx` into its own
  file in both apps (`components/` / `game-ui/components/`) — was an inline
  function, now shared between that modal and the new recap below.
- **`GameEndingRecap.jsx`** (new, both apps): replaces the countdown overlay
  entirely. Pick any player at the table — not just yourself — via a row of
  avatar chips, and see: every fortune card they've ever drawn, each row with
  the same "Why?" + `LessonTip` "learn more" affordance as the in-game popup
  (just a compact list row instead of the full-screen modal, since this list
  can run to two dozen cards across a game); and three single-series
  `MiniLineChart`s for that player — net worth, passive cash flow, and
  monthly earnings — per the dataviz skill, three different scales, so three
  charts, never one dual-axis chart. Viewing another player's cards/timelines
  is unrestricted for everyone — this is post-game and purely informational,
  no permission gating needed.
- **The countdown is gone — no auto-advance at all.** `GAME_ENDING_COUNTDOWN_SECONDS`
  is removed from `data/gameConfig.js` in both apps; `useGame.js`'s (standalone)
  and `ArenaGameBoard.jsx`'s (Arena) auto-advance `useEffect`s are deleted.
  The screen now waits for a deliberate "Continue to Leaderboard" click, which
  dispatches/submits the same `FINALIZE_GAME_OVER` action from Round 9 — no
  engine or allowlist change needed here, since that action already existed
  and is unchanged. **Arena-specific note:** in `ArenaGameBoard.jsx`, every
  connected client renders its own copy of the recap and browses at its own
  pace (unlike `ACK_FORTUNE_CARD`'s elected-single-client convention); the
  first client to click "Continue" submits `FINALIZE_GAME_OVER` for the whole
  table, and it's still safe with no election rule because that action is a
  pure no-op once status is already `'gameover'`.
- **Deploy state:** `resolve-move` redeployed as version 30, `sweep-missing-players`
  as version 6 — both purely to pick up the refreshed `bundle.generated.js`
  (the new history fields), since no new client-submittable action type was
  added this round. Verified byte-identical `bundle.generated.js` and
  `gameRoom.ts` content between the two deployments (SHA256 compared after
  fetching both back), which matters because both independently replay the
  same `vm_moves` history through `gameReducer` — a version drift between them
  could produce divergent replayed state. `send-recap-email` and `room` were
  not touched this round.
- **Verification:** a throwaway script drove a full 24-month `'online'`-mode
  game through the bundled engine end-to-end (same bundle file resolve-move
  and sweep-missing-players import), confirming all three new history arrays
  land exactly 24 entries per player with the right month numbers, and that
  `totalIncomeHistory`'s figure is always ≥ that month's `passiveIncomeHistory`
  figure (earnings = allowance + passive, and allowance is never negative). A
  matching script ran the same checks against the standalone engine directly.
  `scripts/test-engine-bundle.mjs` still passes; `npm run build` is clean in
  both `app/` and the VentureFlow standalone repo.

## Known gaps

- **Supabase Auth's Site URL / redirect URL is still `http://localhost:3000`.**
  Email confirmation links work (they verify the account server-side
  regardless of where they redirect), but after clicking one the browser
  gets redirected to `localhost:3000` instead of back to the live app. Fix
  in the Supabase dashboard: Authentication → URL Configuration → set Site
  URL to `https://arena-web-production-6e64.up.railway.app` (and add it to
  Redirect URLs). Confirmed via a real signup during live testing — the
  account itself came through fine, only the post-confirmation redirect is
  wrong.
- **`sweep-missing-players` has no schedule wired up.** It needs to run
  periodically (e.g. hourly) via `pg_cron` + `pg_net` or Supabase's Cron
  integration — see `INSTRUCTIONS.md` step 4b. Neither extension is enabled
  on the project yet; enabling one is a project-wide change this build
  deliberately left for you to approve rather than doing unasked. Voluntary
  resign (`CONVERT_SEAT_TO_AI`, already in the app, confirmed working live)
  works today regardless — only the automatic timeout sweep needs this.
- **Guest-to-real upgrade isn't wired up.** Supabase's identity-linking makes
  it possible for a guest to later attach a real email/password to the same
  user (keeping their progress), but the UI flow for that isn't built yet.
- **`sweep-missing-players` has no schedule wired up.** It needs to run
  periodically (e.g. hourly) via `pg_cron` + `pg_net` or Supabase's Cron
  integration — see `INSTRUCTIONS.md` step 4b. Neither extension is enabled
  on the project yet; enabling one is a project-wide change this build
  deliberately left for you to approve rather than doing unasked. Voluntary
  resign (`CONVERT_SEAT_TO_AI`, already in the app) works today regardless —
  only the automatic timeout sweep needs this.
- **Friends graph UI isn't built.** `vm_friendships` exists in the schema;
  the lobby currently does room browsing/invite-codes instead of a friends
  list. Worth adding once real play is confirmed working.

## Deploying the app

`app/` is a static Vite build, currently hosted on Railway
(`arena-web-production-6e64.up.railway.app`), built directly from this
repo's `main` branch:

- **Root directory:** `app`
- **Build command:** `npm install && npm run build`
- **Start command:** `npx serve -s dist -l $PORT`
- **Env vars (build-time — Vite bakes these into the bundle, so they must be
  set before the build runs, not just at runtime):** `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`

Any other static host (Render, Netlify, Vercel, Cloudflare Pages, GitHub
Pages) works the same way — same build command, publish `app/dist`, same two
env vars.

The full loop this backend was built to support — guest/email sign-in →
create a room → fill/claim seats → start game → take a few turns (including
letting an AI seat's turn auto-chain) → resign → confirm the takeover shows
up for everyone — has been run live against the deployed app and backend;
see "Current status" above.

## Applying the backend to a fresh Supabase project

See `INSTRUCTIONS.md` for the exact steps if starting over. Short version:
run the three migrations in order, enable Auth (email + anonymous), deploy
both functions, schedule `sweep-missing-players`, point `app/.env.local` at
the project's URL + anon key.
