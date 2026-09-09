-- ============================================================================
-- 0006 — Venture Arena layer
-- ----------------------------------------------------------------------------
-- Identity (photo, ranked colors, business mini-profile), seat color
-- assignment with ranked fallback, challenges, per-game results + ratings,
-- persona snapshots, daily rhythms (topic of the day, quiz, check-in
-- streaks, Arena Points), and membership tiers. All objects are vm_-prefixed
-- and additive; the shared project's other products are untouched.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership tiers. Anonymous guests are is_guest=true rows with tier 'free'.
-- ---------------------------------------------------------------------------
update public.vm_profiles set tier = 'member' where tier = 'paid';
alter table public.vm_profiles drop constraint if exists vm_profiles_tier_check;
alter table public.vm_profiles add constraint vm_profiles_tier_check
  check (tier in ('free', 'member', 'premium', 'vip'));

-- ---------------------------------------------------------------------------
-- Profile extras
-- ---------------------------------------------------------------------------
alter table public.vm_profiles add column if not exists photo_url text;
alter table public.vm_profiles add column if not exists color_ranks text[] not null default '{}';
alter table public.vm_profiles add column if not exists headline text;
alter table public.vm_profiles add column if not exists business_stage text;
alter table public.vm_profiles add column if not exists industry text;
alter table public.vm_profiles add column if not exists looking_for text;
alter table public.vm_profiles add column if not exists skills text[] not null default '{}';
alter table public.vm_profiles add column if not exists timezone text;
alter table public.vm_profiles add column if not exists last_seen_at timestamptz;
alter table public.vm_profiles add column if not exists streak_count int not null default 0;
alter table public.vm_profiles add column if not exists streak_last_day date;
alter table public.vm_profiles add column if not exists points_balance int not null default 0;
alter table public.vm_profiles drop constraint if exists vm_profiles_business_stage_check;
alter table public.vm_profiles add constraint vm_profiles_business_stage_check
  check (business_stage is null or business_stage in ('idea', 'building', 'launched', 'scaling', 'exited', 'investor'));
alter table public.vm_profiles drop constraint if exists vm_profiles_headline_check;
alter table public.vm_profiles add constraint vm_profiles_headline_check
  check (headline is null or char_length(headline) <= 120);

-- ---------------------------------------------------------------------------
-- Color palette + seat color assignment with ranked fallback
-- ---------------------------------------------------------------------------
create table if not exists public.vm_colors (
  key text primary key,
  name text not null,
  hex text not null,
  sort_order int not null
);
alter table public.vm_colors enable row level security;
drop policy if exists "vm_colors are readable by everyone" on public.vm_colors;
create policy "vm_colors are readable by everyone" on public.vm_colors for select using (true);
insert into public.vm_colors (key, name, hex, sort_order) values
  ('gold', 'Gold', '#C9962B', 1), ('felt', 'Felt Green', '#1F6A4B', 2), ('teal', 'Teal', '#1C7C86', 3),
  ('plum', 'Plum', '#6B3D8C', 4), ('brick', 'Brick', '#B24A2F', 5), ('cobalt', 'Cobalt', '#2F5DA8', 6),
  ('coral', 'Coral', '#D97B3C', 7), ('slate', 'Slate', '#5B6478', 8), ('rose', 'Rose', '#B83B6E', 9),
  ('olive', 'Olive', '#6F7F2B', 10), ('ink', 'Ink', '#16203A', 11), ('sky', 'Sky', '#3E8FD1', 12)
on conflict (key) do nothing;

alter table public.vm_room_seats add column if not exists color_key text references public.vm_colors(key);

-- Assigns a color to every occupied seat of a room, in seat order: a member
-- gets their first-ranked color if no earlier seat holds it, else their
-- second, else their third, else the first free color in palette order. AI
-- seats take the next free palette color. Idempotent: re-running keeps
-- already-assigned colors. Called by resolve-move at START_GAME (service
-- role) and by the app for the lobby preview.
create or replace function public.vm_assign_seat_colors(p_room_id uuid)
returns table(seat_index int, color_key text)
language plpgsql security definer set search_path = public as $$
declare
  r record; v_taken text[] := '{}'; v_pick text; v_rank text;
begin
  select coalesce(array_agg(s.color_key), '{}') into v_taken
    from public.vm_room_seats s where s.room_id = p_room_id and s.color_key is not null;
  for r in
    select s.seat_index as si, s.user_id, s.color_key as ck, coalesce(p.color_ranks, '{}') as ranks
    from public.vm_room_seats s left join public.vm_profiles p on p.id = s.user_id
    where s.room_id = p_room_id order by s.seat_index
  loop
    if r.ck is not null then continue; end if;
    v_pick := null;
    foreach v_rank in array r.ranks loop
      if not (v_rank = any(v_taken)) and exists (select 1 from public.vm_colors c where c.key = v_rank) then
        v_pick := v_rank; exit;
      end if;
    end loop;
    if v_pick is null then
      select c.key into v_pick from public.vm_colors c where not (c.key = any(v_taken)) order by c.sort_order limit 1;
    end if;
    if v_pick is null then continue; end if;
    v_taken := v_taken || v_pick;
    update public.vm_room_seats s set color_key = v_pick where s.room_id = p_room_id and s.seat_index = r.si;
  end loop;
  return query select s.seat_index, s.color_key from public.vm_room_seats s where s.room_id = p_room_id order by s.seat_index;
end; $$;
grant execute on function public.vm_assign_seat_colors(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Arena Points ledger + check-in streaks
-- ---------------------------------------------------------------------------
create table if not exists public.vm_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  kind text not null,               -- checkin | quiz | topic_reply | game_played | game_won | challenge_accepted | playtest | referral
  points int not null,
  ref_id uuid,
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index if not exists vm_points_ledger_user_idx on public.vm_points_ledger(user_id, created_at desc);
create unique index if not exists vm_points_ledger_once_per_day_idx
  on public.vm_points_ledger(user_id, kind, day) where kind in ('checkin', 'quiz');
alter table public.vm_points_ledger enable row level security;
drop policy if exists "a user can read their own vm_points_ledger" on public.vm_points_ledger;
create policy "a user can read their own vm_points_ledger" on public.vm_points_ledger for select using (auth.uid() = user_id);
-- No insert policy: points are only written by security-definer functions and the service role.

create or replace function public.vm_award_points(p_user_id uuid, p_kind text, p_points int, p_ref_id uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.vm_points_ledger (user_id, kind, points, ref_id) values (p_user_id, p_kind, p_points, p_ref_id)
    on conflict do nothing;
  if not found then return false; end if;
  update public.vm_profiles set points_balance = points_balance + p_points where id = p_user_id;
  return true;
end; $$;

-- Daily check-in: extends the streak (one free "freeze" — a single missed
-- day doesn't reset it), awards points, returns the profile's streak.
create or replace function public.vm_checkin()
returns table(streak int, awarded boolean, points_balance int)
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_today date := (now() at time zone 'utc')::date; v_last date; v_streak int; v_awarded boolean;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  select streak_last_day, streak_count into v_last, v_streak from public.vm_profiles where id = v_me;
  if v_last = v_today then
    return query select v_streak, false, p.points_balance from public.vm_profiles p where p.id = v_me; return;
  end if;
  if v_last is null or v_last < v_today - 2 then v_streak := 1;
  else v_streak := coalesce(v_streak, 0) + 1; end if;
  update public.vm_profiles set streak_count = v_streak, streak_last_day = v_today, last_seen_at = now() where id = v_me;
  v_awarded := public.vm_award_points(v_me, 'checkin', case when v_streak >= 7 then 15 else 10 end);
  return query select v_streak, v_awarded, p.points_balance from public.vm_profiles p where p.id = v_me;
end; $$;
grant execute on function public.vm_checkin() to authenticated;

create or replace function public.vm_touch_presence()
returns void language sql security definer set search_path = public as $$
  update public.vm_profiles set last_seen_at = now() where id = auth.uid();
$$;
grant execute on function public.vm_touch_presence() to authenticated;

-- ---------------------------------------------------------------------------
-- Topic of the Day + replies
-- ---------------------------------------------------------------------------
create table if not exists public.vm_daily_topics (
  id uuid primary key default gen_random_uuid(),
  day date unique,
  theme text not null,
  title text not null,
  prompt text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.vm_topic_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.vm_daily_topics(id) on delete cascade,
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists vm_topic_replies_topic_idx on public.vm_topic_replies(topic_id, created_at);
alter table public.vm_daily_topics enable row level security;
alter table public.vm_topic_replies enable row level security;
drop policy if exists "vm_daily_topics are readable by everyone signed in" on public.vm_daily_topics;
create policy "vm_daily_topics are readable by everyone signed in" on public.vm_daily_topics for select using (true);
drop policy if exists "vm_topic_replies are readable by everyone signed in" on public.vm_topic_replies;
create policy "vm_topic_replies are readable by everyone signed in" on public.vm_topic_replies for select using (true);
drop policy if exists "members can reply to a topic" on public.vm_topic_replies;
create policy "members can reply to a topic" on public.vm_topic_replies for insert with check (
  auth.uid() = user_id and exists (select 1 from public.vm_profiles where id = auth.uid() and is_guest = false));
drop policy if exists "authors can delete their own reply" on public.vm_topic_replies;
create policy "authors can delete their own reply" on public.vm_topic_replies for delete using (auth.uid() = user_id);

-- Today's topic: the row dated today if one exists, otherwise rotate
-- through the bank by day-of-epoch so the lobby is never empty.
create or replace function public.vm_today_topic()
returns setof public.vm_daily_topics language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'utc')::date as d),
  exact as (select t.* from public.vm_daily_topics t, today where t.day = today.d),
  bank as (select t.*, row_number() over (order by sort_order, created_at) - 1 as rn, count(*) over () as n from public.vm_daily_topics t)
  select id, day, theme, title, prompt, sort_order, created_at from exact
  union all
  select id, day, theme, title, prompt, sort_order, created_at from bank, today
    where not exists (select 1 from exact) and rn = (extract(epoch from today.d)::bigint / 86400) % n
  limit 1;
$$;
grant execute on function public.vm_today_topic() to authenticated;

create or replace function public.vm_reply_to_topic(p_topic_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.vm_profiles where id = v_me and is_guest) then
    raise exception 'Create a free account to join the conversation';
  end if;
  insert into public.vm_topic_replies (topic_id, user_id, body) values (p_topic_id, v_me, p_body) returning id into v_id;
  if (select count(*) from public.vm_topic_replies where user_id = v_me and topic_id = p_topic_id) = 1 then
    perform public.vm_award_points(v_me, 'topic_reply', 5, p_topic_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.vm_reply_to_topic(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Daily quiz
-- ---------------------------------------------------------------------------
create table if not exists public.vm_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  day date unique,
  theme text not null,
  question text not null,
  options jsonb not null,          -- ["A", "B", "C", "D"]
  answer_index int not null,
  explanation text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.vm_quiz_answers (
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  question_id uuid not null references public.vm_quiz_questions(id) on delete cascade,
  choice int not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.vm_quiz_questions enable row level security;
alter table public.vm_quiz_answers enable row level security;
-- Questions are read through vm_today_quiz() (which hides the answer until
-- the caller has answered); no direct select policy on purpose.
drop policy if exists "a user can read their own vm_quiz_answers" on public.vm_quiz_answers;
create policy "a user can read their own vm_quiz_answers" on public.vm_quiz_answers for select using (auth.uid() = user_id);

create or replace function public.vm_today_quiz()
returns table(id uuid, theme text, question text, options jsonb, answered boolean, my_choice int, correct boolean, answer_index int, explanation text)
language plpgsql stable security definer set search_path = public as $$
declare v_q public.vm_quiz_questions; v_today date := (now() at time zone 'utc')::date; v_a public.vm_quiz_answers;
begin
  select * into v_q from public.vm_quiz_questions q where q.day = v_today;
  if v_q.id is null then
    select b.id, b.day, b.theme, b.question, b.options, b.answer_index, b.explanation, b.sort_order, b.created_at into v_q from (
      select q.*, row_number() over (order by q.sort_order, q.created_at) - 1 as rn, count(*) over () as n
      from public.vm_quiz_questions q) b
    where b.rn = (extract(epoch from v_today)::bigint / 86400) % b.n;
  end if;
  if v_q.id is null then return; end if;
  select * into v_a from public.vm_quiz_answers a where a.user_id = auth.uid() and a.question_id = v_q.id;
  return query select v_q.id, v_q.theme, v_q.question, v_q.options, v_a.user_id is not null, v_a.choice, v_a.correct,
    case when v_a.user_id is not null then v_q.answer_index end,
    case when v_a.user_id is not null then v_q.explanation end;
end; $$;
grant execute on function public.vm_today_quiz() to authenticated;

create or replace function public.vm_answer_quiz(p_question_id uuid, p_choice int)
returns table(correct boolean, answer_index int, explanation text, awarded boolean)
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_q public.vm_quiz_questions; v_correct boolean; v_awarded boolean := false;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  select * into v_q from public.vm_quiz_questions q where q.id = p_question_id;
  if v_q.id is null then raise exception 'unknown question'; end if;
  v_correct := (p_choice = v_q.answer_index);
  insert into public.vm_quiz_answers (user_id, question_id, choice, correct) values (v_me, p_question_id, p_choice, v_correct)
    on conflict do nothing;
  if found then
    v_awarded := public.vm_award_points(v_me, 'quiz', case when v_correct then 10 else 3 end, p_question_id);
  end if;
  return query select v_correct, v_q.answer_index, v_q.explanation, v_awarded;
end; $$;
grant execute on function public.vm_answer_quiz(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Challenges (member → member, for a specific game)
-- ---------------------------------------------------------------------------
create table if not exists public.vm_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.vm_profiles(id) on delete cascade,
  challenged_id uuid not null references public.vm_profiles(id) on delete cascade,
  game_id uuid not null references public.vm_games(id),
  room_id uuid references public.vm_rooms(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  message text check (message is null or char_length(message) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  responded_at timestamptz
);
create index if not exists vm_challenges_challenged_idx on public.vm_challenges(challenged_id, status, created_at desc);
create index if not exists vm_challenges_challenger_idx on public.vm_challenges(challenger_id, status, created_at desc);
alter table public.vm_challenges enable row level security;
drop policy if exists "parties can read their vm_challenges" on public.vm_challenges;
create policy "parties can read their vm_challenges" on public.vm_challenges for select
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);
-- Writes go through the functions below.

-- Daily challenge allowance by tier (blueprint §9): guests 3, free 10, paid unlimited.
create or replace function public.vm_challenge_allowance(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when p.is_guest then 3 when p.tier = 'free' then 10 else 1000000 end from public.vm_profiles p where p.id = p_user_id;
$$;

create or replace function public.vm_send_challenge(p_to uuid, p_game_slug text, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game uuid; v_id uuid; v_used int;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if v_me = p_to then raise exception 'you cannot challenge yourself'; end if;
  select id into v_game from public.vm_games where slug = p_game_slug and status = 'live';
  if v_game is null then raise exception 'that game is not playable here yet'; end if;
  select count(*) into v_used from public.vm_challenges
    where challenger_id = v_me and created_at > now() - interval '24 hours';
  if v_used >= public.vm_challenge_allowance(v_me) then
    raise exception 'Daily challenge limit reached — upgrade for unlimited challenges';
  end if;
  if exists (select 1 from public.vm_friendships f where f.status = 'blocked'
             and ((f.user_id = p_to and f.friend_id = v_me) or (f.user_id = v_me and f.friend_id = p_to))) then
    raise exception 'you cannot challenge this member';
  end if;
  insert into public.vm_challenges (challenger_id, challenged_id, game_id, message)
    values (v_me, p_to, v_game, nullif(trim(p_message), '')) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.vm_send_challenge(uuid, text, text) to authenticated;

-- Accepting creates the room: challenger hosts seat 0, accepter takes seat 1,
-- plus one AI seat so the table always has three players. Returns the room id.
create or replace function public.vm_respond_to_challenge(p_challenge_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); c public.vm_challenges; v_room uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  select * into c from public.vm_challenges where id = p_challenge_id for update;
  if c.id is null or c.challenged_id <> v_me then raise exception 'not your challenge'; end if;
  if c.status <> 'pending' then raise exception 'this challenge was already answered'; end if;
  if c.expires_at < now() then
    update public.vm_challenges set status = 'expired' where id = c.id;
    raise exception 'this challenge has expired';
  end if;
  if not p_accept then
    update public.vm_challenges set status = 'declined', responded_at = now() where id = c.id;
    return null;
  end if;
  insert into public.vm_rooms (game_id, host_id, name)
    values (c.game_id, c.challenger_id, 'Challenge match') returning id into v_room;
  insert into public.vm_room_seats (room_id, seat_index, user_id) values (v_room, 0, c.challenger_id), (v_room, 1, v_me);
  insert into public.vm_room_seats (room_id, seat_index, bot_personality_id) values (v_room, 2, 'random');
  update public.vm_challenges set status = 'accepted', responded_at = now(), room_id = v_room where id = c.id;
  perform public.vm_award_points(v_me, 'challenge_accepted', 5, c.id);
  return v_room;
end; $$;
grant execute on function public.vm_respond_to_challenge(uuid, boolean) to authenticated;

create or replace function public.vm_cancel_challenge(p_challenge_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.vm_challenges set status = 'cancelled', responded_at = now()
  where id = p_challenge_id and challenger_id = auth.uid() and status = 'pending';
$$;
grant execute on function public.vm_cancel_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Friends: request / accept helpers on top of vm_friendships
-- ---------------------------------------------------------------------------
create or replace function public.vm_request_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if v_me = p_friend_id then raise exception 'that is you'; end if;
  if exists (select 1 from public.vm_profiles where id = v_me and is_guest) then
    raise exception 'Create a free account to add friends';
  end if;
  -- If they already asked us, accept instead of creating a second row.
  if exists (select 1 from public.vm_friendships where user_id = p_friend_id and friend_id = v_me and status = 'pending') then
    update public.vm_friendships set status = 'accepted' where user_id = p_friend_id and friend_id = v_me;
    return;
  end if;
  insert into public.vm_friendships (user_id, friend_id, status) values (v_me, p_friend_id, 'pending') on conflict do nothing;
end; $$;
grant execute on function public.vm_request_friend(uuid) to authenticated;

create or replace function public.vm_respond_friend(p_user_id uuid, p_accept boolean)
returns void language sql security definer set search_path = public as $$
  update public.vm_friendships set status = case when p_accept then 'accepted' else 'blocked' end
  where user_id = p_user_id and friend_id = auth.uid() and status = 'pending';
$$;
grant execute on function public.vm_respond_friend(uuid, boolean) to authenticated;

-- Members you've played with (for "suggested friends"), most recent first.
create or replace function public.vm_recent_tablemates(p_limit int default 12)
returns table(user_id uuid, games_together bigint, last_played timestamptz)
language sql stable security definer set search_path = public as $$
  select other.user_id, count(distinct other.room_id), max(r.created_at)
  from public.vm_room_seats mine
  join public.vm_room_seats other on other.room_id = mine.room_id and other.user_id is not null and other.user_id <> mine.user_id
  join public.vm_rooms r on r.id = mine.room_id
  where mine.user_id = auth.uid()
  group by other.user_id order by 3 desc limit p_limit;
$$;
grant execute on function public.vm_recent_tablemates(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Game results, ratings, persona
-- ---------------------------------------------------------------------------
create table if not exists public.vm_game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  room_id uuid not null references public.vm_rooms(id) on delete cascade,
  game_id uuid references public.vm_games(id) on delete set null,
  placement int not null,
  player_count int not null,
  human_count int not null,
  score numeric not null,
  rating_before int not null,
  rating_after int not null,
  signals jsonb not null default '{}'::jsonb,   -- raw style signals for this game
  finished_at timestamptz not null default now(),
  unique (user_id, room_id)
);
create index if not exists vm_game_results_user_idx on public.vm_game_results(user_id, finished_at desc);
alter table public.vm_game_results enable row level security;
drop policy if exists "vm_game_results are readable by any signed-in user" on public.vm_game_results;
create policy "vm_game_results are readable by any signed-in user" on public.vm_game_results for select using (true);

create table if not exists public.vm_ratings (
  user_id uuid not null references public.vm_profiles(id) on delete cascade,
  game_id uuid not null references public.vm_games(id) on delete cascade,
  rating int not null default 1200,
  games_played int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
alter table public.vm_ratings enable row level security;
drop policy if exists "vm_ratings are readable by any signed-in user" on public.vm_ratings;
create policy "vm_ratings are readable by any signed-in user" on public.vm_ratings for select using (true);

-- Six style dimensions, each 0–100, plus the derived label. One row per
-- member, rewritten after every finished game (history kept in
-- vm_game_results.signals).
create table if not exists public.vm_personas (
  user_id uuid primary key references public.vm_profiles(id) on delete cascade,
  risk int not null default 50,
  horizon int not null default 50,
  negotiation int not null default 50,
  cooperation int not null default 50,
  speed int not null default 50,
  resilience int not null default 50,
  label text not null default 'Explorer',
  games_counted int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.vm_personas enable row level security;
drop policy if exists "vm_personas are readable by any signed-in user" on public.vm_personas;
create policy "vm_personas are readable by any signed-in user" on public.vm_personas for select using (true);

-- Arena Rank derived from rating, games, and community points.
create or replace function public.vm_arena_rank(p_rating int, p_games int, p_points int)
returns text language sql immutable as $$
  select case
    when p_games >= 40 and p_rating >= 1500 and p_points >= 1500 then 'Mogul'
    when p_games >= 20 and p_rating >= 1350 and p_points >= 600 then 'Partner'
    when p_games >= 10 and p_rating >= 1250 then 'Operator'
    when p_games >= 3 then 'Founder'
    else 'Rookie' end;
$$;

-- Public "Arena Record" for a member — one call for the profile page.
create or replace function public.vm_arena_record(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'premium_interest' - 'premium_interest_at' from public.vm_profiles p where p.id = p_user_id),
    'persona', (select to_jsonb(x) from public.vm_personas x where x.user_id = p_user_id),
    'ratings', (select coalesce(jsonb_agg(jsonb_build_object('game', g.slug, 'name', g.name, 'rating', r.rating, 'games', r.games_played, 'wins', r.wins)), '[]'::jsonb)
                from public.vm_ratings r join public.vm_games g on g.id = r.game_id where r.user_id = p_user_id),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'icon', d.icon, 'count', c.n) order by d.sort_order), '[]'::jsonb)
               from (select badge_id, count(*) n from public.vm_badge_awards where user_id = p_user_id group by badge_id) c
               join public.vm_badge_defs d on d.id = c.badge_id),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('room_id', gr.room_id, 'game', g.slug, 'placement', gr.placement, 'players', gr.player_count,
                 'score', gr.score, 'rating_after', gr.rating_after, 'delta', gr.rating_after - gr.rating_before, 'finished_at', gr.finished_at) order by gr.finished_at desc), '[]'::jsonb)
               from (select * from public.vm_game_results where user_id = p_user_id order by finished_at desc limit 20) gr
               left join public.vm_games g on g.id = gr.game_id),
    'rank', public.vm_arena_rank(
      coalesce((select max(rating) from public.vm_ratings where user_id = p_user_id), 1200),
      coalesce((select sum(games_played) from public.vm_ratings where user_id = p_user_id), 0)::int,
      coalesce((select points_balance from public.vm_profiles where id = p_user_id), 0))
  );
$$;
grant execute on function public.vm_arena_record(uuid) to authenticated;

-- Members online (seen in the last 3 minutes) — for the lobby's "Your table" strip.
create or replace function public.vm_online_members(p_limit int default 30)
returns table(id uuid, display_name text, avatar text, photo_url text, tier text, is_guest boolean, last_seen_at timestamptz, persona_label text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar, p.photo_url, p.tier, p.is_guest, p.last_seen_at, x.label
  from public.vm_profiles p left join public.vm_personas x on x.user_id = p.id
  where p.last_seen_at > now() - interval '3 minutes' and p.id <> auth.uid()
  order by p.last_seen_at desc limit p_limit;
$$;
grant execute on function public.vm_online_members(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Avatar photos: public bucket, members write only inside their own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vm-avatars', 'vm-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "vm-avatars are publicly readable" on storage.objects;
create policy "vm-avatars are publicly readable" on storage.objects for select using (bucket_id = 'vm-avatars');
drop policy if exists "members upload their own vm-avatars" on storage.objects;
create policy "members upload their own vm-avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'vm-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "members replace their own vm-avatars" on storage.objects;
create policy "members replace their own vm-avatars" on storage.objects for update to authenticated
  using (bucket_id = 'vm-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "members delete their own vm-avatars" on storage.objects;
create policy "members delete their own vm-avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'vm-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
