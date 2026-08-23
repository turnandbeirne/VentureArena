# VentureMaker Arena

A generic, game-agnostic multiplayer platform for VentureMaker games, built on
Supabase. VentureFlow is the first game plugged into it. The shared Supabase
project is `opportunity-engines-platform` (id `iwpysmrmunirsvdrecmw`) — it also
hosts unrelated live business data, which is why every object this repo owns
is `vm_`-prefixed (see `0001_init.sql`'s header) and the deploy boundary is
scoped to exactly `vm_*` tables + the `resolve-move` / `sweep-missing-players`
functions.

**Current status:** schema (migrations 0001-0003), both edge functions
(`resolve-move` v26, `sweep-missing-players` v2), and the full app — auth,
lobby (create/join rooms, seat claiming), and a realtime gameplay screen — are
all built and, for the backend half, deployed and live against the real
project. The app itself builds cleanly (`cd app && npm run build`) but is not
yet hosted anywhere reachable by a browser — see "Known gaps" for why and what
it needs.

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

## Known gaps

- **The app isn't hosted anywhere live yet.** It builds cleanly to static
  files (`cd app && npm run build` → `app/dist/`), but getting it onto a real
  URL needs either a git host Render can clone from, or a host that accepts a
  direct artifact upload — and this environment had no credentials for
  either (no GitHub/Railway connector, no push access anywhere) when this was
  built. See "Deploying the app" below for the concrete options.
- **No live HTTP smoke test of `resolve-move`/`sweep-missing-players` has
  been run.** The functions are deployed and the deploy itself succeeded
  (Supabase's own bundler would have rejected a broken payload), and the
  exact deployed bundle passed `npm test` before deploying — but actually
  calling the live HTTPS endpoints needs either the app to be hosted (so it
  can be driven from a real browser) or `scripts/smoke-test-live.mjs` run
  from a machine with normal network access — this environment's outbound
  network is proxied and blocks `*.supabase.co` directly. Once the app is
  hosted, driving a real game through it in a browser doubles as this test.
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

`app/` is a static Vite build — any static host works. Two ways to get it
live, once you can grant the credentials this environment didn't have:

- **Push this repo to GitHub, then point Render at it** (Render is already
  connected to this Supabase-adjacent workflow): create a repo, `git push`,
  then create a Render static site with build command
  `cd app && npm install && npm run build`, publish path `app/dist`, and the
  two env vars from `app/.env.local` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) set as the site's environment variables.
- **Any other static host** (Netlify, Vercel, Cloudflare Pages, GitHub
  Pages) works the same way — build command `npm run build` inside `app/`,
  publish `app/dist`, same two env vars.

Once it's live, run through: guest sign-in → create a room → fill/claim
seats → start game → take a few turns (including letting an AI seat's turn
auto-chain) → resign → confirm the takeover shows up for everyone. That's
the full loop this backend was built to support.

## Applying the backend to a fresh Supabase project

See `INSTRUCTIONS.md` for the exact steps if starting over. Short version:
run the three migrations in order, enable Auth (email + anonymous), deploy
both functions, schedule `sweep-missing-players`, point `app/.env.local` at
the project's URL + anon key.
