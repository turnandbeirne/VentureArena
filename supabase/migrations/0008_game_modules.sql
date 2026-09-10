-- ============================================================================
-- 0008 — Game module registry
-- ----------------------------------------------------------------------------
-- The server-side engine for each game lives here as source text, versioned.
-- Edge functions load the active module at cold start (see
-- supabase/functions/_shared/bundle.loader.js) and import it as an ES module
-- from a data: URL, so a new game — or a new version of VentureFlow's engine —
-- is "snapped in" with a row update, not a function redeploy. Only the
-- service role can read or write this table (no RLS policies on purpose).
-- ============================================================================
create table if not exists public.vm_game_modules (
  slug text not null,
  version int not null,
  source text not null default '',
  sha256 text,
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  primary key (slug, version)
);
alter table public.vm_game_modules enable row level security;
-- Exactly one active version per game.
create unique index if not exists vm_game_modules_one_active_idx on public.vm_game_modules(slug) where is_active;

-- Integrity check used after chunked uploads: hash of the stored source.
create or replace function public.vm_game_module_digest(p_slug text, p_version int)
returns table(chars int, sha256 text, md5_chunks text[])
language sql stable security definer set search_path = public as $$
  select char_length(source), encode(sha256(convert_to(source, 'UTF8')), 'hex'),
         (select array_agg(md5(substr(source, 1 + i * 8000, 8000)) order by i)
            from generate_series(0, greatest(0, (char_length(source) - 1) / 8000)) i)
  from public.vm_game_modules where slug = p_slug and version = p_version;
$$;

-- Staging table for chunked uploads of a module's source (each chunk verified
-- by md5 before assembly — see scripts/upload-game-module.mjs and the PR notes).
create table if not exists public.vm_game_module_chunks (
  slug text, version int, idx int, body text not null,
  primary key (slug, version, idx)
);
alter table public.vm_game_module_chunks enable row level security;

-- Schedule the idle-seat sweep every 15 minutes (pg_cron + pg_net are enabled
-- on the project). Idempotent: unschedule first if the job already exists.
do $$ begin
  perform cron.unschedule('vm-sweep-missing-players');
exception when others then null; end $$;
select cron.schedule('vm-sweep-missing-players', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://iwpysmrmunirsvdrecmw.supabase.co/functions/v1/sweep-missing-players',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.vm_app_config where key = 'sweep_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cron$);
