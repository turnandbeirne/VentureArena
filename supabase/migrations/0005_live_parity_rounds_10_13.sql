-- ============================================================================
-- 0005 — Live-parity migration (Rounds 10–13, reconstructed from production)
-- ----------------------------------------------------------------------------
-- The production project (opportunity-engines-platform) was extended beyond
-- what this repo's migrations 0001–0004 describe: a game catalog with
-- statuses and external links, a profile tier flag, direct messages, a
-- forum, a per-player event ledger, and badge awards. Those objects were
-- created directly on the live database; this file captures them so a fresh
-- environment reaches the same schema, and so later migrations have a
-- documented base. Everything is idempotent — it is a no-op on production.
-- ============================================================================

-- vm_games: catalog metadata + linked (external) games -----------------------
alter table public.vm_games add column if not exists status text not null default 'live';
alter table public.vm_games add column if not exists icon text;
alter table public.vm_games add column if not exists description text;
alter table public.vm_games add column if not exists external_url text;
alter table public.vm_games add column if not exists min_seats int;
alter table public.vm_games add column if not exists max_seats int;
alter table public.vm_games add column if not exists sort_order int not null default 0;
alter table public.vm_games drop constraint if exists vm_games_status_check;
alter table public.vm_games add constraint vm_games_status_check
  check (status in ('live', 'coming_soon', 'external_link'));

insert into public.vm_games (slug, name, status, icon, description, min_seats, max_seats, sort_order)
values ('ventureflow', 'VentureFlow', 'live', '📈', 'Build a portfolio, race the clock, out-invest the table.', 2, 5, 1)
on conflict (slug) do update set name = excluded.name, icon = excluded.icon, description = excluded.description,
  min_seats = excluded.min_seats, max_seats = excluded.max_seats, sort_order = excluded.sort_order;
insert into public.vm_games (slug, name, status, icon, description, sort_order) values
  ('venturemaker', 'VentureMaker', 'coming_soon', '🛠️', 'Build and pitch a startup with your table — coming soon.', 2)
on conflict (slug) do nothing;
insert into public.vm_games (slug, name, status, icon, description, external_url, sort_order) values
  ('boardgamearena', 'Board Game Arena', 'external_link', '🎲', 'Hundreds of classic and modern board games, free to play online.', 'https://boardgamearena.com', 3),
  ('boardgameuniverse', 'BoardGameUniverse', 'external_link', '🌐', 'Free online board games and strategy challenges.', 'https://boardgameuniverse.com', 4)
on conflict (slug) do nothing;

-- vm_profiles: tier + premium interest ----------------------------------------
alter table public.vm_profiles add column if not exists tier text not null default 'free';
alter table public.vm_profiles add column if not exists premium_interest boolean not null default false;
alter table public.vm_profiles add column if not exists premium_interest_at timestamptz;

create or replace function public.vm_express_premium_interest()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.vm_profiles set premium_interest = true, premium_interest_at = now()
    where id = auth.uid() and is_guest = false;
end; $$;

create or replace function public.vm_find_profile_by_email(p_email text)
returns table(id uuid, display_name text, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar
  from auth.users u join public.vm_profiles p on p.id = u.id
  where lower(u.email) = lower(p_email) and p.is_guest = false limit 1;
$$;

create or replace function public.vm_handle_user_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous is distinct from old.is_anonymous then
    update public.vm_profiles set is_guest = new.is_anonymous where id = new.id;
  end if;
  return new;
end; $$;

-- Direct messages ---------------------------------------------------------------
create table if not exists public.vm_dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  kind text not null default 'dm' check (kind in ('dm', 'group')),
  title text,
  created_by uuid references public.vm_profiles(id)
);
create table if not exists public.vm_dm_participants (
  thread_id uuid not null references public.vm_dm_threads(id) on delete cascade,
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_read_at timestamptz,
  is_admin boolean not null default false,
  primary key (thread_id, user_id)
);
create table if not exists public.vm_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.vm_dm_threads(id) on delete cascade,
  sender_id uuid not null references public.vm_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists vm_dm_threads_created_by_idx on public.vm_dm_threads(created_by);
create index if not exists vm_dm_participants_user_idx on public.vm_dm_participants(user_id);
create index if not exists vm_dm_messages_thread_idx on public.vm_dm_messages(thread_id, created_at);
alter table public.vm_dm_threads enable row level security;
alter table public.vm_dm_participants enable row level security;
alter table public.vm_dm_messages enable row level security;

create or replace function public.vm_is_dm_participant(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vm_dm_participants where thread_id = p_thread_id and user_id = auth.uid());
$$;

drop policy if exists "participants can read their vm_dm_threads" on public.vm_dm_threads;
create policy "participants can read their vm_dm_threads" on public.vm_dm_threads for select using (public.vm_is_dm_participant(id));
drop policy if exists "participants can read their vm_dm_participants rows" on public.vm_dm_participants;
create policy "participants can read their vm_dm_participants rows" on public.vm_dm_participants for select using (public.vm_is_dm_participant(thread_id));
drop policy if exists "a participant can update their own vm_dm_participants row" on public.vm_dm_participants;
create policy "a participant can update their own vm_dm_participants row" on public.vm_dm_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "participants can read messages in their vm_dm_threads" on public.vm_dm_messages;
create policy "participants can read messages in their vm_dm_threads" on public.vm_dm_messages for select using (public.vm_is_dm_participant(thread_id));
drop policy if exists "a member can send a vm_dm_messages message in their thread" on public.vm_dm_messages;
create policy "a member can send a vm_dm_messages message in their thread" on public.vm_dm_messages for insert with check (
  auth.uid() = sender_id and public.vm_is_dm_participant(thread_id)
  and exists (select 1 from public.vm_profiles where id = auth.uid() and is_guest = false));

create or replace function public.vm_touch_dm_thread()
returns trigger language plpgsql security definer set search_path = public as $$
begin update public.vm_dm_threads set last_message_at = new.created_at where id = new.thread_id; return new; end; $$;
drop trigger if exists vm_on_dm_message_insert on public.vm_dm_messages;
create trigger vm_on_dm_message_insert after insert on public.vm_dm_messages for each row execute function public.vm_touch_dm_thread();

create or replace function public.vm_start_dm_thread(p_other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_thread_id uuid; v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if v_me = p_other_user_id then raise exception 'cannot start a DM with yourself'; end if;
  if not exists (select 1 from public.vm_profiles where id = v_me and is_guest = false) then
    raise exception 'guests cannot start direct messages — become a member first';
  end if;
  select dp1.thread_id into v_thread_id
  from public.vm_dm_participants dp1 join public.vm_dm_participants dp2 on dp1.thread_id = dp2.thread_id
  join public.vm_dm_threads t on t.id = dp1.thread_id and t.kind = 'dm'
  where dp1.user_id = v_me and dp2.user_id = p_other_user_id limit 1;
  if v_thread_id is not null then return v_thread_id; end if;
  insert into public.vm_dm_threads default values returning id into v_thread_id;
  insert into public.vm_dm_participants (thread_id, user_id) values (v_thread_id, v_me), (v_thread_id, p_other_user_id);
  return v_thread_id;
end; $$;

create or replace function public.vm_start_group_thread(p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_thread_id uuid; v_me uuid := auth.uid(); v_name text := nullif(trim(p_name), '');
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.vm_profiles where id = v_me and is_guest = false) then
    raise exception 'guests cannot start group conversations — become a member first';
  end if;
  if v_name is null then raise exception 'a group needs a name'; end if;
  insert into public.vm_dm_threads (kind, title, created_by) values ('group', v_name, v_me) returning id into v_thread_id;
  insert into public.vm_dm_participants (thread_id, user_id, is_admin) values (v_thread_id, v_me, true);
  insert into public.vm_dm_participants (thread_id, user_id, is_admin)
    select v_thread_id, p.id, false from public.vm_profiles p where p.id = any(p_member_ids) and p.id <> v_me
    on conflict do nothing;
  return v_thread_id;
end; $$;

create or replace function public.vm_add_group_participants(p_thread_id uuid, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.vm_dm_participants where thread_id = p_thread_id and user_id = v_me) then
    raise exception 'only a participant can add people to this conversation';
  end if;
  if not exists (select 1 from public.vm_dm_threads where id = p_thread_id and kind = 'group') then
    raise exception 'not a group conversation';
  end if;
  insert into public.vm_dm_participants (thread_id, user_id, is_admin)
    select p_thread_id, p.id, false from public.vm_profiles p where p.id = any(p_member_ids) on conflict do nothing;
end; $$;

-- Forum ---------------------------------------------------------------------------
create table if not exists public.vm_forum_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.vm_forum_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.vm_forum_categories(id) on delete cascade,
  author_id uuid not null references public.vm_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now()
);
create table if not exists public.vm_forum_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.vm_forum_topics(id) on delete cascade,
  author_id uuid not null references public.vm_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists vm_forum_topics_category_idx on public.vm_forum_topics(category_id, last_post_at desc);
create index if not exists vm_forum_posts_topic_idx on public.vm_forum_posts(topic_id, created_at);
alter table public.vm_forum_categories enable row level security;
alter table public.vm_forum_topics enable row level security;
alter table public.vm_forum_posts enable row level security;
drop policy if exists "vm_forum_categories are readable by anyone signed in" on public.vm_forum_categories;
create policy "vm_forum_categories are readable by anyone signed in" on public.vm_forum_categories for select using (true);
drop policy if exists "vm_forum_topics are readable by anyone signed in" on public.vm_forum_topics;
create policy "vm_forum_topics are readable by anyone signed in" on public.vm_forum_topics for select using (true);
drop policy if exists "members can start a vm_forum_topics topic" on public.vm_forum_topics;
create policy "members can start a vm_forum_topics topic" on public.vm_forum_topics for insert with check (
  auth.uid() = author_id and exists (select 1 from public.vm_profiles where id = auth.uid() and is_guest = false));
drop policy if exists "vm_forum_posts are readable by anyone signed in" on public.vm_forum_posts;
create policy "vm_forum_posts are readable by anyone signed in" on public.vm_forum_posts for select using (true);
drop policy if exists "members can write a vm_forum_posts reply" on public.vm_forum_posts;
create policy "members can write a vm_forum_posts reply" on public.vm_forum_posts for insert with check (
  auth.uid() = author_id and exists (select 1 from public.vm_profiles where id = auth.uid() and is_guest = false));

create or replace function public.vm_touch_forum_topic()
returns trigger language plpgsql security definer set search_path = public as $$
begin update public.vm_forum_topics set last_post_at = new.created_at where id = new.topic_id; return new; end; $$;
drop trigger if exists vm_on_forum_post_insert on public.vm_forum_posts;
create trigger vm_on_forum_post_insert after insert on public.vm_forum_posts for each row execute function public.vm_touch_forum_topic();

insert into public.vm_forum_categories (slug, name, description, sort_order) values
  ('general', 'General', 'Say hello, introduce yourself, talk about anything VentureMaker.', 1),
  ('strategy', 'Strategy & Tips', 'Share tactics, builds, and lessons learned across games.', 2),
  ('find-a-team', 'Find a Team', 'Looking for co-players, a squad, or collaborators for a real project.', 3),
  ('build-together', 'Build Together', 'Turn a game session into a real idea, side project, or company.', 4),
  ('feedback', 'Feedback & Ideas', 'Bugs, feature requests, and what you want to see next.', 5)
on conflict (slug) do nothing;

-- Player events (scored activity) + badges ------------------------------------------
create table if not exists public.vm_player_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  game_id uuid references public.vm_games(id) on delete set null,
  room_id uuid references public.vm_rooms(id) on delete set null,
  event_type text not null,
  points int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vm_player_events_user_idx on public.vm_player_events(user_id, created_at desc);
alter table public.vm_player_events enable row level security;
drop policy if exists "vm_player_events are readable by any signed-in user" on public.vm_player_events;
create policy "vm_player_events are readable by any signed-in user" on public.vm_player_events for select using (true);

create table if not exists public.vm_badge_defs (
  id text primary key,
  name text not null,
  icon text not null,
  description text not null,
  sort_order int not null default 0
);
comment on table public.vm_badge_defs is 'Display metadata mirroring the game engine''s BADGES catalog (supabase/functions/_shared/data/gameConfig.js). Keep in sync by hand if that catalog changes — there are only 7 entries.';
create table if not exists public.vm_badge_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vm_profiles(id),
  badge_id text not null references public.vm_badge_defs(id),
  room_id uuid references public.vm_rooms(id),
  game_id uuid references public.vm_games(id),
  awarded_at timestamptz not null default now(),
  unique (user_id, room_id, badge_id)
);
comment on table public.vm_badge_awards is 'One row per badge a player actually earned in a completed room. Written server-side by resolve-move (see recordGameResults in gameRoom.ts) from the authoritative final game state, never client-submitted.';
create index if not exists vm_badge_awards_user_id_idx on public.vm_badge_awards(user_id);
create index if not exists vm_badge_awards_badge_id_idx on public.vm_badge_awards(badge_id);
create index if not exists vm_badge_awards_room_id_idx on public.vm_badge_awards(room_id);
create index if not exists vm_badge_awards_game_id_idx on public.vm_badge_awards(game_id);
alter table public.vm_badge_defs enable row level security;
alter table public.vm_badge_awards enable row level security;
drop policy if exists "vm_badge_defs are readable by any signed-in user" on public.vm_badge_defs;
create policy "vm_badge_defs are readable by any signed-in user" on public.vm_badge_defs for select using (true);
drop policy if exists "vm_badge_awards are readable by any signed-in user" on public.vm_badge_awards;
create policy "vm_badge_awards are readable by any signed-in user" on public.vm_badge_awards for select using (true);

insert into public.vm_badge_defs (id, name, icon, description, sort_order) values
  ('moneyGrower', 'Money Grower', '🌱', 'Earn $100+ per month in passive income', 1),
  ('boss', 'Boss', '🚀', 'Own 2 or more businesses', 2),
  ('saver', 'Saver', '🐷', 'Own 5 or more Piggy Banks', 3),
  ('balancedInvestor', 'Balanced Investor', '🧺', 'Own 3 or more different kinds of assets at once', 4),
  ('cashedOut', 'Cashed Out', '💼', 'Sell a business for a buyout offer', 5),
  ('empireBuilder', 'Empire Builder', '🏙️', 'Own the most businesses at the table (2 or more)', 6),
  ('topEarner', 'Top Earner', '💎', 'Have the most lucrative businesses at the table ($100+/mo)', 7)
on conflict (id) do nothing;

create or replace view public.vm_leaderboard_scores as
  select user_id, max(points) as best_score, count(*) as games_played,
         count(*) filter (where (metadata->>'placement')::int = 1) as wins
  from public.vm_player_events where event_type = 'game_finished' group by user_id;
create or replace view public.vm_leaderboard_badges as
  select user_id, count(*) as badge_count, count(distinct badge_id) as distinct_badges
  from public.vm_badge_awards group by user_id;
