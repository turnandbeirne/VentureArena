-- ============================================================================
-- VentureMaker Arena — core platform schema
-- ----------------------------------------------------------------------------
-- Game-agnostic by design: VentureFlow is the first row in `games`, but
-- nothing below is VentureFlow-specific. A second VentureMaker title
-- registers itself in `games` and reuses every other table unchanged.
--
-- NAMESPACED with a `vm_` prefix on every table/function/trigger. This
-- project's Supabase instance (opportunity-engines-platform) is shared with
-- an unrelated, already-live business platform that has its OWN
-- `public.profiles` table and its OWN `trg_handle_new_user` trigger on
-- auth.users. Without the prefix, this migration's
-- `create table if not exists public.profiles` would silently no-op against
-- that real table and conflate two apps' user data — so every object here
-- gets its own name, and nothing here ever touches `public.profiles`,
-- `trg_handle_new_user`, or any other pre-existing object in that project.
--
-- Apply this once, in order, via the Supabase SQL editor (reachable from your
-- Lovable project's Supabase panel) or `supabase db push` if you use the CLI.
-- See ../../INSTRUCTIONS.md for the full walkthrough.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- vm_profiles — one row per Supabase auth user, guest or real, FOR THE ARENA.
-- Created automatically on signup (including anonymous/guest signup) by the
-- trigger at the bottom of this file, so the app never has to remember to
-- insert one by hand. Deliberately separate from any other app's own
-- profiles table sharing this project — see the header comment above.
-- ----------------------------------------------------------------------------
create table if not exists public.vm_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  avatar text,
  is_guest boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.vm_profiles enable row level security;

create policy "vm_profiles are readable by any signed-in user"
  on public.vm_profiles for select
  to authenticated
  using (true);

create policy "a user can update only their own vm_profiles row"
  on public.vm_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- vm_games — the VentureMaker title catalog. Add one row per game; everything
-- else (rooms, seats, moves) references vm_games.id, not a hardcoded name.
-- ----------------------------------------------------------------------------
create table if not exists public.vm_games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.vm_games enable row level security;

create policy "vm_games are readable by any signed-in user"
  on public.vm_games for select
  to authenticated
  using (true);

insert into public.vm_games (slug, name)
values ('ventureflow', 'VentureFlow')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- vm_friendships — a symmetric relationship, stored as two directed rows
-- (simplest to write RLS for; the app always reads/writes both sides).
-- status: 'pending' | 'accepted' | 'blocked'
-- ----------------------------------------------------------------------------
create table if not exists public.vm_friendships (
  user_id uuid not null references public.vm_profiles (id) on delete cascade,
  friend_id uuid not null references public.vm_profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table public.vm_friendships enable row level security;

create policy "a user can see vm_friendships involving them"
  on public.vm_friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "a user can create a vm_friendships request from themselves"
  on public.vm_friendships for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "a user can update a vm_friendships row involving them"
  on public.vm_friendships for update
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

-- ----------------------------------------------------------------------------
-- vm_rooms — one game session. `rng_seed` is fixed at creation and is what
-- makes server-side replay deterministic (see resolve-move edge function) —
-- every random roll the game engine makes is reproduced bit-for-bit by
-- reseeding to this value before replaying the room's moves.
-- status: 'open' (waiting for seats to fill) | 'active' | 'finished'
-- ----------------------------------------------------------------------------
create table if not exists public.vm_rooms (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.vm_games (id),
  host_id uuid not null references public.vm_profiles (id),
  status text not null default 'open' check (status in ('open', 'active', 'finished')),
  rng_seed bigint not null default (floor(random() * 2147483647)),
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  -- Free-form per-game setup config (difficulty, scenario, humanNames order,
  -- etc.) — passed straight through as the payload of the room's move #0
  -- (a START_GAME action) so the edge function's replay needs no special
  -- casing for "how a room began."
  setup jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vm_rooms enable row level security;

create policy "vm_rooms are readable by any signed-in user"
  on public.vm_rooms for select
  to authenticated
  using (true);

create policy "a user can create a vm_rooms row as their own host"
  on public.vm_rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy "the host can update their own vm_rooms row"
  on public.vm_rooms for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- ----------------------------------------------------------------------------
-- vm_room_seats — one row per player slot in a room. A seat is either a human
-- (user_id set) or a named AI bot (bot_personality_id set) — never both null,
-- never both set. seat_index matches the game engine's player-array order.
-- ----------------------------------------------------------------------------
create table if not exists public.vm_room_seats (
  room_id uuid not null references public.vm_rooms (id) on delete cascade,
  seat_index int not null,
  user_id uuid references public.vm_profiles (id),
  bot_personality_id text,
  created_at timestamptz not null default now(),
  primary key (room_id, seat_index),
  constraint vm_room_seats_exactly_one_occupant check (
    (user_id is not null and bot_personality_id is null) or
    (user_id is null and bot_personality_id is not null)
  )
);

alter table public.vm_room_seats enable row level security;

create policy "vm_room_seats are readable by any signed-in user"
  on public.vm_room_seats for select
  to authenticated
  using (true);

create policy "the room host can manage vm_room_seats"
  on public.vm_room_seats for all
  to authenticated
  using (exists (select 1 from public.vm_rooms r where r.id = room_id and r.host_id = auth.uid()))
  with check (exists (select 1 from public.vm_rooms r where r.id = room_id and r.host_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- vm_moves — BOTH the async turn record and the full audit/replay log. A
-- room's current authoritative state is defined as "replay every move for
-- this room_id, in seq order, through the game engine's reducer, after
-- reseeding the RNG from vm_rooms.rng_seed." Only the resolve-move edge
-- function (service-role key) writes here — clients only ever read.
-- ----------------------------------------------------------------------------
create table if not exists public.vm_moves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.vm_rooms (id) on delete cascade,
  seq int not null,
  seat_index int not null,
  action jsonb not null,
  resulting_log_entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (room_id, seq)
);

alter table public.vm_moves enable row level security;

create policy "vm_moves are readable by any signed-in user"
  on public.vm_moves for select
  to authenticated
  using (true);

-- No insert/update/delete policy for regular users on purpose — moves are
-- written exclusively by the resolve-move edge function using the Supabase
-- service-role key, which bypasses RLS entirely. This is the anti-cheat
-- boundary: a client can request a move, but only the server-side function
-- (running the real game engine) decides what actually gets appended.

-- ----------------------------------------------------------------------------
-- Auto-create a vm_profiles row whenever a new auth user is created — covers
-- both real signups and anonymous/guest sign-ins identically, so the rest of
-- the schema never has to special-case guests. Named and scoped so it never
-- collides with this project's own pre-existing new-user provisioning
-- (trg_handle_new_user / its own trigger function) — that trigger is left
-- completely untouched; this one is purely additive.
-- ----------------------------------------------------------------------------
create or replace function public.vm_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.vm_profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Guest'),
    new.is_anonymous
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists vm_on_auth_user_created on auth.users;
create trigger vm_on_auth_user_created
  after insert on auth.users
  for each row execute function public.vm_handle_new_user();

-- ----------------------------------------------------------------------------
-- Realtime — broadcast new moves to everyone in a room. The client subscribes
-- to postgres_changes on `vm_moves` filtered by room_id; this is the
-- "generic real-time relay" the platform architecture calls for, reused
-- unchanged later for synchronous play (see README.md).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.vm_moves;
alter publication supabase_realtime add table public.vm_room_seats;
