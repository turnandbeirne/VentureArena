# Applying this to venturemaker.org (via Lovable)

Since I don't have live access to your Lovable/Supabase accounts, these are
the exact steps to run yourself. Should take well under an hour for steps
1-5; step 6 is optional and only matters once you're ready to actually build
the lobby UI inside Lovable itself. Step 4b (scheduling
`sweep-missing-players`) is what makes missing-in-action takeover automatic —
skip it for now if you only want to test voluntary resign, which works as
soon as step 4 is deployed.

## 1. Connect Supabase in Lovable (skip if already connected)

In your venturemaker.org Lovable project, open the Supabase panel (usually a
button/icon in the top toolbar) and connect/create a Supabase project if you
haven't already. Lovable provisions it for you — no separate signup needed.

## 2. Run the schema migrations

In the Supabase dashboard for that project (Lovable's Supabase panel has a
direct link, or use supabase.com/dashboard), open **SQL Editor** and run, in
order:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_room_size_and_takeover.sql`

Both are idempotent (`create table if not exists`, `drop constraint if
exists`, etc.) so they're safe to re-run if you're not sure they applied
cleanly.

## 3. Enable Auth methods

In **Authentication → Providers**:
- **Email** should already be on by default (used for real accounts).
- Turn on **Anonymous Sign-Ins** — this is what powers "Continue as guest."
  It's under Authentication → Providers → Anonymous in current Supabase
  dashboards (the exact label has moved around across Supabase versions —
  search "anonymous" in the Providers page if you don't see it immediately).

## 4. Deploy both edge functions

You'll need the Supabase CLI once (`npm install -g supabase`, then
`supabase login`). From this folder:

```
supabase link --project-ref YOUR-PROJECT-REF   # find this in your Supabase project's Settings -> General
npm run build:engine                            # regenerates _shared/bundle.generated.js
supabase functions deploy resolve-move
supabase functions deploy sweep-missing-players
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every
deployed function — nothing to configure by hand for `resolve-move`.
`sweep-missing-players` needs one secret you choose yourself, since it has no
user session to authenticate against and would otherwise be callable by
anyone:

```
supabase secrets set SWEEP_CRON_SECRET=$(openssl rand -hex 24)
```

Keep the value it prints — you'll pass it as a header when scheduling the
function in step 4b.

**Sanity check before deploying**, if you want it (recommended): from this
folder, run
```
node scripts/test-engine-bundle.mjs
node scripts/test-ai-chain-resolution.mjs
```
The first confirms the bundled game engine is deterministic and that a
5-seat mixed roster + a resign/takeover both behave correctly; the second
exercises the actual AI-turn-chaining logic against a mocked database. Both
should end by printing that everything passed.

## 4b. Schedule sweep-missing-players

This function needs to run periodically (e.g. hourly) on its own — nothing
calls it automatically. Supabase's standard way to schedule an Edge Function
is `pg_cron` + `pg_net`, run once from the SQL Editor:

```sql
select cron.schedule(
  'sweep-missing-players-hourly',
  '0 * * * *', -- every hour; tune to taste
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sweep-missing-players',
    headers := jsonb_build_object('x-cron-secret', 'THE_SECRET_FROM_STEP_4'),
    body := '{}'::jsonb
  );
  $$
);
```

(If your project doesn't have `pg_cron`/`pg_net` enabled yet, turn them on
under **Database → Extensions** first.) Supabase's dashboard also has a more
point-and-click **Cron** integration under **Integrations** in newer
projects — if you see that, it's a UI wrapper around the same thing and
either works; use whichever is available on your project.

## 5. Point the app at your project

Copy `app/.env.example` to `app/.env.local` and fill in your project's URL and
anon/public key — both are on the Supabase dashboard's **Project Settings →
API** page. (If your project uses Supabase's newer key-naming, this may be
labeled "publishable key" instead of "anon key" — either works here, that's
what `VITE_SUPABASE_ANON_KEY` should be set to.)

Then:
```
cd app
npm install
npm run dev
```
That gets you a working sign-up / sign-in / guest flow against your real
Supabase project, locally, to confirm everything above actually wired up
correctly, before it's part of the live site.

## 6. Getting this into venturemaker.org itself

Two ways to go, and they're not mutually exclusive:

- **Deploy `app/` as its own site** (e.g. `arena.venturemaker.org`) and link
  to it from venturemaker.org. Fastest path to something live and testable —
  any static host works since it's a Vite build (`npm run build` → `dist/`).
- **Hand this to Lovable's AI as a reference** and have it build the
  equivalent screens natively inside the venturemaker.org Lovable project, so
  the Arena looks and feels like the rest of the site instead of a separate
  app. Point Lovable's chat at `app/src/pages/AuthScreen.jsx` and
  `app/src/lib/supabaseClient.js` and describe the same sign-up/sign-in/guest
  behavior — Lovable is generally good at translating a working reference
  into its own component style. This is the better long-term answer; the
  first option is the faster way to confirm the backend works today.

Either way, the schema and edge function from steps 2-4 are shared — you're
only choosing how the *frontend* gets built.
