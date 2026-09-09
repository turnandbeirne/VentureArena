-- ============================================================================
-- Configurable idle timeout (warn-then-AI-takeover, or never), room naming,
-- and the internal secret store the sweep cron job authenticates with.
-- ----------------------------------------------------------------------------
-- Builds on 0001-0003. Run after them, same way.
-- ============================================================================

-- Replaces the old fixed `turn_timeout_hours` (default 48h, no "never"
-- option) with minute-granularity and an explicit "never time out" (null) —
-- some VentureMaker games may run for weeks or longer, tied to real-world
-- progress, so a room needs to be able to opt entirely out of the sweep.
-- Host picks this at room creation; default is 15 minutes.
alter table public.vm_rooms
  add column if not exists turn_timeout_minutes int;

update public.vm_rooms
  set turn_timeout_minutes = coalesce(turn_timeout_minutes, turn_timeout_hours * 60)
  where turn_timeout_minutes is null;

alter table public.vm_rooms drop column if exists turn_timeout_hours;
alter table public.vm_rooms alter column turn_timeout_minutes set default 15;

comment on column public.vm_rooms.turn_timeout_minutes is
  'Minutes a seat can go idle before sweep-missing-players warns, then (after the same duration again with no move or break request) converts it to AI. Null = never time out this room.';

-- "Take a break" grace window: a blocking player can ask (via resolve-move's
-- REQUEST_BREAK, capped at 24h) for the sweep to leave their seat alone
-- until this timestamp, instead of it converting to AI. While in the
-- future, both the warning banner and the sweep's takeover check are
-- suppressed entirely for this room. Once it passes, the idle clock
-- restarts fresh from break_until (not from whenever they went idle before
-- the break), so returning from a break always gets a full fresh warning
-- window rather than an instant takeover.
alter table public.vm_rooms
  add column if not exists break_until timestamptz;

-- A host-chosen display name for the room (distinct from the auto-generated
-- invite_code), shown in lobby lists and the room header. Optional — falls
-- back to "Room <invite_code>" in the app when null/blank.
alter table public.vm_rooms
  add column if not exists name text;

-- ----------------------------------------------------------------------------
-- vm_app_config — tiny internal key/value store for secrets the app's own
-- server-side code needs to compare against (e.g. the sweep cron job's
-- shared secret). Deliberately has NO RLS policies at all, so only the
-- service-role key (used by the edge functions' adminClient, which bypasses
-- RLS entirely) can ever read or write it — not even an authenticated user
-- can see it via PostgREST. This is how the cron secret is verified instead
-- of an Edge Function env var, since no tool in this session's reach can set
-- an Edge Function secret directly (see the sweep-missing-players deploy
-- notes / migration commit message for the full reasoning).
-- ----------------------------------------------------------------------------
create table if not exists public.vm_app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.vm_app_config enable row level security;
-- No policies created on purpose — see comment above.

insert into public.vm_app_config (key, value)
values ('sweep_cron_secret', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Give every new profile a starting avatar (previously always null, falling
-- back to a generic 🙂 in the UI everywhere) so a seat looks like *someone*
-- from the moment an account exists, even before the new profile-editor UI
-- is used to change it. Purely cosmetic; existing rows are untouched.
-- ----------------------------------------------------------------------------
create or replace function public.vm_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  starter_avatars text[] := array['🦊','🐻','🐼','🐸','🦁','🐨','🐯','🦉','🐙','🐢','🦄','🐳'];
begin
  insert into public.vm_profiles (id, display_name, avatar, is_guest)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Guest'),
    starter_avatars[1 + (abs(hashtext(new.id::text)) % array_length(starter_avatars, 1))],
    new.is_anonymous
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
