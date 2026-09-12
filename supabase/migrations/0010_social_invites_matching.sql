-- ============================================================================
-- 0010 — Social profiles, invites with referral codes, match suggestions,
--        double opt-in location
-- ----------------------------------------------------------------------------
-- Additive and idempotent. All objects vm_-prefixed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profile: social links, current project, goals, location (opt-in)
-- ---------------------------------------------------------------------------
alter table public.vm_profiles add column if not exists social_links jsonb not null default '{}'::jsonb; -- {linkedin, x, instagram, website, youtube}
alter table public.vm_profiles add column if not exists current_project text;   -- what they're building right now
alter table public.vm_profiles add column if not exists goals text;             -- what they want from the Arena
alter table public.vm_profiles add column if not exists city text;
alter table public.vm_profiles add column if not exists region text;            -- state / country
alter table public.vm_profiles add column if not exists share_location boolean not null default false;
alter table public.vm_profiles add column if not exists referral_code text;
alter table public.vm_profiles add column if not exists referred_by uuid references public.vm_profiles(id);
alter table public.vm_profiles drop constraint if exists vm_profiles_current_project_check;
alter table public.vm_profiles add constraint vm_profiles_current_project_check check (current_project is null or char_length(current_project) <= 200);
alter table public.vm_profiles drop constraint if exists vm_profiles_goals_check;
alter table public.vm_profiles add constraint vm_profiles_goals_check check (goals is null or char_length(goals) <= 300);
create unique index if not exists vm_profiles_referral_code_idx on public.vm_profiles(referral_code);

-- Precise coordinates live in their own table that only the owner can read;
-- other members only ever see a rounded distance, and only when BOTH sides
-- opted in (see vm_match_suggestions).
create table if not exists public.vm_locations (
  user_id uuid primary key references public.vm_profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.vm_locations enable row level security;
drop policy if exists "a member reads only their own vm_locations row" on public.vm_locations;
create policy "a member reads only their own vm_locations row" on public.vm_locations for select using (auth.uid() = user_id);
revoke select on public.vm_profiles from anon;

-- Every member gets a short referral code (8 chars, unambiguous alphabet).
create or replace function public.vm_ensure_referral_code(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  select referral_code into v_code from public.vm_profiles where id = p_user_id;
  if v_code is not null then return v_code; end if;
  loop
    v_code := '';
    for i in 1..8 loop v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      update public.vm_profiles set referral_code = v_code where id = p_user_id;
      return v_code;
    exception when unique_violation then null; end;
  end loop;
end; $$;

create or replace function public.vm_my_referral_code()
returns text language sql security definer set search_path = public as $$
  select public.vm_ensure_referral_code(auth.uid());
$$;
grant execute on function public.vm_my_referral_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Invites: one row per invitation the member sends (text, email, link, share).
-- The invite itself is delivered by the member's own phone/mail app (Web
-- Share API, sms:, mailto:) — no server-side SMS/email cost, no spam surface.
-- When the invitee joins with ?ref=CODE the referral is credited.
-- ---------------------------------------------------------------------------
create table if not exists public.vm_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.vm_profiles(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email', 'link', 'share')),
  contact text,                          -- phone or email if the member typed one (optional)
  invitee_name text,
  room_code text,                        -- when inviting to a specific table
  code text not null,
  created_at timestamptz not null default now(),
  joined_user_id uuid references public.vm_profiles(id) on delete set null,
  joined_at timestamptz
);
create index if not exists vm_invites_inviter_idx on public.vm_invites(inviter_id, created_at desc);
alter table public.vm_invites enable row level security;
drop policy if exists "members read their own vm_invites" on public.vm_invites;
create policy "members read their own vm_invites" on public.vm_invites for select using (auth.uid() = inviter_id);

create or replace function public.vm_log_invite(p_channel text, p_contact text default null, p_name text default null, p_room_code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  insert into public.vm_invites (inviter_id, channel, contact, invitee_name, room_code, code)
    values (v_me, p_channel, nullif(trim(p_contact), ''), nullif(trim(p_name), ''), p_room_code, public.vm_ensure_referral_code(v_me))
    returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.vm_log_invite(text, text, text, text) to authenticated;

-- Called once by the app after sign-up when a ?ref=CODE was captured.
-- Credits the inviter (+20 points, once per referred member) and links the two as friends-pending.
create or replace function public.vm_claim_referral(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_inviter uuid;
begin
  if v_me is null or p_code is null then return false; end if;
  select id into v_inviter from public.vm_profiles where referral_code = upper(trim(p_code));
  if v_inviter is null or v_inviter = v_me then return false; end if;
  if exists (select 1 from public.vm_profiles where id = v_me and referred_by is not null) then return false; end if;
  update public.vm_profiles set referred_by = v_inviter where id = v_me;
  update public.vm_invites set joined_user_id = v_me, joined_at = now()
    where inviter_id = v_inviter and joined_user_id is null and id = (
      select id from public.vm_invites where inviter_id = v_inviter and joined_user_id is null order by created_at desc limit 1);
  perform public.vm_award_points(v_inviter, 'referral', 20, v_me);
  insert into public.vm_friendships (user_id, friend_id, status) values (v_inviter, v_me, 'pending') on conflict do nothing;
  return true;
end; $$;
grant execute on function public.vm_claim_referral(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Location: opt-in, coarse. The app sends coordinates only when the member
-- turns sharing on; turning it off clears them.
-- ---------------------------------------------------------------------------
create or replace function public.vm_set_location(p_share boolean, p_lat double precision default null, p_lng double precision default null, p_city text default null, p_region text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.vm_profiles set share_location = p_share,
    city = coalesce(nullif(trim(p_city), ''), city), region = coalesce(nullif(trim(p_region), ''), region)
    where id = auth.uid();
  if p_share and p_lat is not null and p_lng is not null then
    insert into public.vm_locations (user_id, lat, lng, updated_at) values (auth.uid(), p_lat, p_lng, now())
      on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  elsif not p_share then
    delete from public.vm_locations where user_id = auth.uid();
  end if;
end; $$;
grant execute on function public.vm_set_location(boolean, double precision, double precision, text, text) to authenticated;

-- Great-circle distance in km (haversine), null if either side is missing.
create or replace function public.vm_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  end;
$$;

-- Lower-cased significant words from free text (stopwords dropped, 3+ chars).
create or replace function public.vm_keywords(p_text text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct w), '{}') from (
    select w from regexp_split_to_table(lower(coalesce(p_text, '')), '[^a-z0-9+#]+') w
    where char_length(w) >= 3 and w not in ('the','and','for','with','that','this','from','have','are','you','your','our','who','can','will','want','looking','need','someone','people','help','get','into','about','more','some','all','any','one','new','out','not','but','they','them','their','has','was','been','also','just','like','build','building','make','making')
  ) k;
$$;

-- ---------------------------------------------------------------------------
-- Match suggestions (blueprint §5): scores every other member against the
-- caller on five signals and returns the top N with human-readable reasons.
--   goals/bio words  — overlap between what I'm looking for and what they offer (and vice versa)
--   industry / stage — same industry; complementary stage (idea<->launched, investor<->building)
--   persona          — complementary style labels, or close style vectors
--   projects         — both have an active project (something to build on)
--   location         — only when BOTH share location: nearer is better; distance rounded to 5 km
-- ---------------------------------------------------------------------------
create or replace function public.vm_match_suggestions(p_limit int default 12)
returns table(user_id uuid, score int, reasons text[], distance_km int)
language plpgsql stable security definer set search_path = public as $$
declare me public.vm_profiles; mp public.vm_personas;
begin
  select * into me from public.vm_profiles where id = auth.uid();
  if me.id is null then return; end if;
  select * into mp from public.vm_personas where vm_personas.user_id = me.id;
  return query
  with cand as (
    select p.*, x.label as persona_label, x.risk, x.horizon, x.negotiation, x.cooperation, x.speed, x.resilience, l.lat, l.lng
    from public.vm_profiles p left join public.vm_personas x on x.user_id = p.id left join public.vm_locations l on l.user_id = p.id
    where p.id <> me.id and p.is_guest = false
      and not exists (select 1 from public.vm_friendships f where f.status = 'blocked'
                      and ((f.user_id = me.id and f.friend_id = p.id) or (f.user_id = p.id and f.friend_id = me.id)))
  ),
  scored as (
    select c.id,
      -- 1. goals / bio keyword overlap (what I look for vs what they say; and the reverse)
      (select count(*) from unnest(public.vm_keywords(coalesce(me.looking_for,'') || ' ' || coalesce(me.goals,''))) w
        where w = any(public.vm_keywords(coalesce(c.headline,'') || ' ' || coalesce(c.current_project,'') || ' ' || array_to_string(c.skills, ' ') || ' ' || coalesce(c.industry,''))))::int as my_needs_hit,
      (select count(*) from unnest(public.vm_keywords(coalesce(c.looking_for,'') || ' ' || coalesce(c.goals,''))) w
        where w = any(public.vm_keywords(coalesce(me.headline,'') || ' ' || coalesce(me.current_project,'') || ' ' || array_to_string(me.skills, ' ') || ' ' || coalesce(me.industry,''))))::int as their_needs_hit,
      -- 2. industry / stage
      (me.industry is not null and c.industry is not null and lower(me.industry) = lower(c.industry)) as same_industry,
      ((me.business_stage in ('idea','building') and c.business_stage in ('launched','scaling','exited','investor'))
        or (c.business_stage in ('idea','building') and me.business_stage in ('launched','scaling','exited','investor'))) as complementary_stage,
      -- 3. persona
      (mp.label is not null and c.persona_label is not null and (mp.label, c.persona_label) in
        (('Builder','Dealmaker'),('Dealmaker','Builder'),('Operator','Wildcard'),('Wildcard','Operator'),
         ('Strategist','Connector'),('Connector','Strategist'),('Closer','Explorer'),('Explorer','Closer'))) as complementary_persona,
      (mp.label is not null and c.persona_label is not null and
        abs(mp.risk - c.risk) + abs(mp.horizon - c.horizon) + abs(mp.speed - c.speed) < 60) as similar_style,
      -- 4. projects
      (me.current_project is not null and c.current_project is not null) as both_building,
      -- 5. location (double opt-in)
      case when me.share_location and c.share_location
           then public.vm_distance_km(ml.lat, ml.lng, c.lat, c.lng) end as dist,
      c.last_seen_at, c.city, c.region, c.persona_label, c.current_project
    from cand c left join public.vm_locations ml on ml.user_id = me.id
  )
  select s.id,
    (least(s.my_needs_hit, 3) * 12 + least(s.their_needs_hit, 3) * 8
     + case when s.same_industry then 15 else 0 end
     + case when s.complementary_stage then 12 else 0 end
     + case when s.complementary_persona then 12 else 0 end
     + case when s.similar_style then 6 else 0 end
     + case when s.both_building then 8 else 0 end
     + case when s.dist is not null then greatest(0, 20 - (s.dist / 10))::int else 0 end
     + case when s.last_seen_at > now() - interval '7 days' then 5 else 0 end)::int as score,
    array_remove(array[
      case when s.my_needs_hit > 0 then 'Matches what you''re looking for' end,
      case when s.their_needs_hit > 0 then 'You match what they''re looking for' end,
      case when s.same_industry then 'Same industry' end,
      case when s.complementary_stage then 'Complementary stage — one has done what the other is doing' end,
      case when s.complementary_persona then 'Complementary playing styles (' || mp.label || ' + ' || s.persona_label || ')' end,
      case when s.similar_style and not s.complementary_persona then 'Similar playing style' end,
      case when s.both_building then 'Both have a project underway' end,
      case when s.dist is not null and s.dist < 50 then 'Nearby' || coalesce(' — ' || s.city, '') end
    ], null) as reasons,
    case when s.dist is not null then (ceil(s.dist / 5) * 5)::int end as distance_km
  from scored s
  where (least(s.my_needs_hit, 3) * 12 + least(s.their_needs_hit, 3) * 8
     + case when s.same_industry then 15 else 0 end + case when s.complementary_stage then 12 else 0 end
     + case when s.complementary_persona then 12 else 0 end + case when s.similar_style then 6 else 0 end
     + case when s.both_building then 8 else 0 end + case when s.dist is not null then greatest(0, 20 - (s.dist / 10))::int else 0 end) > 0
  order by 2 desc, s.last_seen_at desc nulls last
  limit p_limit;
end; $$;
grant execute on function public.vm_match_suggestions(int) to authenticated;

-- Public-safe profile card for another member (never exposes coordinates or email).
create or replace function public.vm_public_profile(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'photo_url', p.photo_url, 'tier', p.tier,
    'is_guest', p.is_guest, 'headline', p.headline, 'business_stage', p.business_stage, 'industry', p.industry,
    'looking_for', p.looking_for, 'skills', p.skills, 'current_project', p.current_project, 'goals', p.goals,
    'social_links', p.social_links, 'city', case when p.share_location then p.city end,
    'region', case when p.share_location then p.region end, 'last_seen_at', p.last_seen_at, 'color_ranks', p.color_ranks)
  from public.vm_profiles p where p.id = p_user_id;
$$;
grant execute on function public.vm_public_profile(uuid) to authenticated;

-- Arena Record: never leak referral/private fields to other members.
create or replace function public.vm_arena_record(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'premium_interest' - 'premium_interest_at' - 'referral_code' - 'referred_by'
                  || jsonb_build_object('city', case when p.share_location then p.city end, 'region', case when p.share_location then p.region end)
                from public.vm_profiles p where p.id = p_user_id),
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

-- Postgres grants EXECUTE to PUBLIC on new functions; nothing here should be
-- reachable without a session.
revoke execute on function public.vm_ensure_referral_code(uuid) from public, anon, authenticated;
revoke execute on function public.vm_match_suggestions(int) from public, anon;
revoke execute on function public.vm_claim_referral(text) from public, anon;
revoke execute on function public.vm_log_invite(text, text, text, text) from public, anon;
revoke execute on function public.vm_my_referral_code() from public, anon;
revoke execute on function public.vm_public_profile(uuid) from public, anon;
revoke execute on function public.vm_set_location(boolean, double precision, double precision, text, text) from public, anon;
revoke execute on function public.vm_distance_km(double precision, double precision, double precision, double precision) from public, anon;
revoke execute on function public.vm_keywords(text) from public, anon;
alter function public.vm_keywords(text) set search_path = public;
alter function public.vm_distance_km(double precision, double precision, double precision, double precision) set search_path = public;
