# Venture Arena — implementation notes (branch `arena-v1`)

Design source of truth: the *Venture Arena Product Blueprint v1* in the
"Venture Arena Reboot" project. This file maps that blueprint onto the code.

## What's in this branch

| Blueprint | Where it lives |
|---|---|
| §7 Identity: photo, avatar, ranked colors with fallback | `0006` (`vm_profiles.photo_url/color_ranks`, `vm_colors`, `vm_assign_seat_colors`), storage bucket `vm-avatars`, `app/src/pages/Me.jsx`, `components/ColorPicker.jsx`; colors assigned server-side at `START_GAME` in `resolve-move` |
| §3 Rhythms: check-in streaks, Arena Points, Topic of the Day, daily quiz | `0006` (`vm_checkin`, `vm_points_ledger`, `vm_daily_topics`, `vm_quiz_*`), `0007` seed (90 topics / 89 questions from `supabase/seed/daily_content.mjs`), `app/src/pages/Home.jsx` |
| §5 Matching & connection: friends, presence, tablemates, challenges | `0006` (`vm_challenges`, `vm_send_challenge` / `vm_respond_to_challenge` with per-tier daily limits, `vm_request_friend`, `vm_online_members`, `vm_recent_tablemates`), `app/src/pages/People.jsx` |
| §6 Ratings, results, Arena Record | `0006` (`vm_game_results`, `vm_ratings`, `vm_arena_record`, `vm_arena_rank`), `supabase/functions/_shared/arenaSignals.ts` (pairwise Elo), `components/ArenaRecord.jsx`, `pages/Member.jsx` |
| §2 Personas (six style dimensions) | `arenaSignals.ts` → `computeStyleSignals` reads the move log; `vm_personas` keeps a running mean; labels per `personaLabel` |
| §9 Tiers | `vm_profiles.tier` ∈ free/member/premium/vip; `pages/Tiers.jsx` (payments stubbed — buttons call `vm_express_premium_interest`) |
| §4 Game plug-in framework | `vm_games.status` (`live` / `coming_soon` = Labs / `external_link` = partner); engine source registry `vm_game_modules` (`0008`) loaded by `_shared/bundle.loader.js` |
| Result card with Rematch / Connect | `app/src/pages/room/ArenaResultCard.jsx` |

## The engine now loads from the database

`supabase/functions/_shared/bundle.generated.js` in the repo is still the
real esbuild bundle (used by local tests). **What is deployed under that
filename is `bundle.loader.js`**: at cold start it reads the active row from
`vm_game_modules` (`slug='ventureflow'`), checks its sha256, and imports it
from a `data:` URL. Reasons: the MCP-based deploy can't carry a 96 KB file
reliably, and it is the blueprint's "snap-in" mechanism — a new engine
version is a row insert + `is_active` flip, no function redeploy.

Uploading a new engine version:
1. `npm run build:engine` (from a checkout whose `game-engine/` is current —
   note the repo's `game-engine/` is *behind* the deployed Round 13 engine;
   re-sync it from VentureFlow before rebuilding, or you will regress).
2. Insert the bundle text into `vm_game_modules (slug, version, source)` with
   the service-role key (`scripts/upload-game-module.mjs` once you have it
   locally) or in 8 KB chunks into `vm_game_module_chunks` and assemble with
   `string_agg` — then compare `vm_game_module_digest(slug, version)` with the
   local sha256 before setting `is_active = true`.

## Live state (as of 9 Sep 2026)

- Migrations 0006–0009 applied to `opportunity-engines-platform`; 0005 is a
  parity file (already true in production) — run it only on fresh projects.
- `resolve-move` v34, `sweep-missing-players` v9 deployed with the loader.
- `vm_game_modules`: ventureflow v13 active, sha256 `1cd89c83…bb7a8d`.
- pg_cron job `vm-sweep-missing-players` every 15 min (drives idle seats to AI
  and, new, finishes all-AI tables so results get recorded).
- Verified end to end: a finished table produced `vm_game_results`,
  `vm_ratings` (1204), a `vm_personas` row and 25 Arena Points.

## Launch checklist (manual, dashboard-only)

1. **Supabase → Authentication → URL Configuration**: Site URL =
   `https://arena.venturemaker.org` (until DNS is live, the Railway URL), and
   add both to Redirect URLs. Also enable **Anonymous sign-ins** (already on)
   and consider **Leaked password protection**.
2. **Railway → arena-web → Settings → Networking**: add custom domain
   `arena.venturemaker.org`, then create the CNAME it shows at your DNS host.
3. Merge this PR; Railway rebuilds from `main` (root `app`).
4. Optional: `RESEND_API_KEY` secret for recap emails (see README).

## Not in this build (next)

Stripe subscriptions; tournaments + hash-chained ledger; Labs playtest
console; offline-game capture; DM/forum UI (tables exist); VentureBoom.

## v2 (10 Sep 2026) — social profiles, invites, matching, onboarding & gates

- **0010** social links, current project, goals, city/region, referral codes, `vm_invites`, `vm_locations` (owner-only coordinates), `vm_match_suggestions` (goals/bio keywords, industry & stage, persona complement/similarity, active projects, distance only when both share), `vm_public_profile`, `vm_set_location`, `vm_claim_referral` (+20 pts, friend request).
- **0011** access ladder: `vm_access()`; guests get exactly one game (`vm_guest_seat_guard` trigger); `email_verified` synced from `auth.users`; `vm_recompute_survey` scores the questionnaire (contact fields excluded) and pays 50/100/150-point bonuses; bios, intros and matches gated behind verified email + ≥70% profile (`vm_can_see_bios`, `vm_match_suggestions_gated`, column-level privacy on `vm_profiles` with `vm_my_profile` / `vm_profile_cards`); paid features (lessons, matchmaking+, prizes, classes, pitch reviews, recruiting, coaching, consulting) mapped to tiers in `vm_access().paid_features`.
- App: sign-in offers *Just play once* / Google / Facebook / LinkedIn / email; 4-step onboarding wizard on first real sign-in; Me tab has email change, socials, project, goals, location double opt-in, invite history; invite by text/email/share/link from Home, People, Me and any open table; People shows *Good matches for you* with reasons and rounded distance; member pages show socials/project/goals only to qualified viewers; Home shows the access ladder notice and locked Member programs.

**Dashboard steps for social sign-in** (Supabase → Authentication → Providers): enable Google, Facebook and LinkedIn (OIDC) with client IDs/secrets from Google Cloud Console, Meta for Developers and LinkedIn Developers, using the callback URL Supabase shows. Until enabled, the buttons show a "not switched on yet" message and email sign-up still works.
