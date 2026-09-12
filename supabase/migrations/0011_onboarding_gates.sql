-- ============================================================================
-- 0011 — Onboarding and access gates
-- ----------------------------------------------------------------------------
-- Access ladder (Michael, 10 Sep 2026):
--   anonymous  — play ONE game, no questions asked
--   recurring  — a verified email to keep playing and keep stats
--   member     — the full questionnaire (plus email or phone) unlocks bios,
--                intros/matches and insights; bonus points for every
--                non-contact section completed
--   paid       — lessons, matchmaking+, prizes, classes, pitch reviews,
--                coaching, recruiting, consulting (Member / Premium / VIP)
-- ============================================================================

alter table public.vm_profiles add column if not exists email_verified boolean not null default false;
alter table public.vm_profiles add column if not exists phone text;
alter table public.vm_profiles add column if not exists survey_score int not null default 0;     -- 0–100, non-contact fields only
alter table public.vm_profiles add column if not exists survey_bonus_awarded int not null default 0; -- highest bonus tier already paid
alter table public.vm_profiles add column if not exists onboarding_done_at timestamptz;
alter table public.vm_profiles add column if not exists auth_provider text;                      -- email | google | facebook | linkedin_oidc

-- Keep email_verified / provider in sync with auth.users (trigger already exists
-- for is_anonymous; extend it and backfill).
create or replace function public.vm_handle_user_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.vm_profiles set
    is_guest = new.is_anonymous,
    email_verified = (new.email_confirmed_at is not null and not new.is_anonymous),
    auth_provider = coalesce(new.raw_app_meta_data ->> 'provider', auth_provider)
  where id = new.id;
  return new;
end; $$;
drop trigger if exists vm_on_auth_user_updated on auth.users;
create trigger vm_on_auth_user_updated after update on auth.users for each row execute function public.vm_handle_user_update();
update public.vm_profiles p set
  email_verified = (u.email_confirmed_at is not null and not u.is_anonymous),
  auth_provider = coalesce(u.raw_app_meta_data ->> 'provider', p.auth_provider)
from auth.users u where u.id = p.id;

-- ---------------------------------------------------------------------------
-- Guests play once. A second seat for an anonymous user is refused with a
-- message the app shows as the "create a free account" prompt.
-- ---------------------------------------------------------------------------
create or replace function public.vm_guard_guest_seats()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_guest boolean; v_games int;
begin
  if new.user_id is null then return new; end if;
  select is_guest into v_guest from public.vm_profiles where id = new.user_id;
  if not coalesce(v_guest, false) then return new; end if;
  select count(distinct s.room_id) into v_games from public.vm_room_seats s
    where s.user_id = new.user_id and s.room_id <> new.room_id;
  if v_games >= 1 then
    raise exception 'Guests can play one game. Create a free account (it takes 20 seconds) to keep playing and keep your stats.';
  end if;
  return new;
end; $$;
drop trigger if exists vm_guest_seat_guard on public.vm_room_seats;
create trigger vm_guest_seat_guard before insert or update of user_id on public.vm_room_seats
  for each row execute function public.vm_guard_guest_seats();

-- ---------------------------------------------------------------------------
-- Access levels, computed in one place and reused by the gates below.
--   'anonymous' | 'unverified' | 'verified' | 'member' (survey complete) | plus tier
-- ---------------------------------------------------------------------------
create or replace function public.vm_access(p_user_id uuid default auth.uid())
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'level', case when p.is_guest then 'anonymous'
                  when not p.email_verified then 'unverified'
                  when p.survey_score < 70 or (p.phone is null and not p.email_verified) then 'verified'
                  else 'member' end,
    'tier', p.tier,
    'paid', p.tier in ('member', 'premium', 'vip'),
    'survey_score', p.survey_score,
    'email_verified', p.email_verified,
    'can_see_bios', (not p.is_guest and p.email_verified and p.survey_score >= 70),
    'can_get_intros', (not p.is_guest and p.email_verified and p.survey_score >= 70),
    'paid_features', jsonb_build_object(
      'lessons', p.tier in ('member','premium','vip'),
      'matchmaking_plus', p.tier in ('member','premium','vip'),
      'prizes', p.tier in ('member','premium','vip'),
      'classes', p.tier in ('member','premium','vip'),
      'pitch_reviews', p.tier in ('premium','vip'),
      'coaching', p.tier = 'vip',
      'recruiting', p.tier in ('premium','vip'),
      'consulting', p.tier = 'vip'))
  from public.vm_profiles p where p.id = p_user_id;
$$;
grant execute on function public.vm_access(uuid) to authenticated;
revoke execute on function public.vm_access(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- Survey completeness → bonus points. Contact info (email/phone) is required
-- for membership but earns nothing; every other section does.
--   weights: name/avatar/colors 10, headline 10, stage 10, industry 10,
--            looking_for 15, goals 15, current_project 15, skills 10, socials 5
--   bonus:   50 pts at 50%, 100 pts at 80%, 150 pts at 100% (cumulative, once)
-- ---------------------------------------------------------------------------
create or replace function public.vm_recompute_survey(p_user_id uuid default auth.uid())
returns table(score int, bonus_awarded int)
language plpgsql security definer set search_path = public as $$
declare p public.vm_profiles; v int := 0; v_tier int := 0; v_award int := 0;
begin
  select * into p from public.vm_profiles where id = p_user_id;
  if p.id is null then return; end if;
  v := v + case when p.display_name is not null and p.display_name not in ('Player','Guest') and cardinality(p.color_ranks) > 0 then 10 else 0 end;
  v := v + case when nullif(trim(coalesce(p.headline,'')),'') is not null then 10 else 0 end;
  v := v + case when p.business_stage is not null then 10 else 0 end;
  v := v + case when nullif(trim(coalesce(p.industry,'')),'') is not null then 10 else 0 end;
  v := v + case when nullif(trim(coalesce(p.looking_for,'')),'') is not null then 15 else 0 end;
  v := v + case when nullif(trim(coalesce(p.goals,'')),'') is not null then 15 else 0 end;
  v := v + case when nullif(trim(coalesce(p.current_project,'')),'') is not null then 15 else 0 end;
  v := v + case when cardinality(p.skills) > 0 then 10 else 0 end;
  v := v + case when p.social_links <> '{}'::jsonb then 5 else 0 end;
  v_tier := case when v >= 100 then 3 when v >= 80 then 2 when v >= 50 then 1 else 0 end;
  update public.vm_profiles set survey_score = v where id = p_user_id;
  if not p.is_guest and v_tier > p.survey_bonus_awarded then
    v_award := (case v_tier when 1 then 50 when 2 then 100 else 150 end) - (case p.survey_bonus_awarded when 1 then 50 when 2 then 100 when 3 then 150 else 0 end);
    insert into public.vm_points_ledger (user_id, kind, points, ref_id) values (p_user_id, 'survey', v_award, null);
    update public.vm_profiles set points_balance = points_balance + v_award, survey_bonus_awarded = v_tier where id = p_user_id;
  end if;
  return query select v, v_award;
end; $$;
grant execute on function public.vm_recompute_survey(uuid) to authenticated;
revoke execute on function public.vm_recompute_survey(uuid) from public, anon;

create or replace function public.vm_finish_onboarding()
returns void language sql security definer set search_path = public as $$
  update public.vm_profiles set onboarding_done_at = coalesce(onboarding_done_at, now()) where id = auth.uid();
$$;
grant execute on function public.vm_finish_onboarding() to authenticated;
revoke execute on function public.vm_finish_onboarding() from public, anon;

-- ---------------------------------------------------------------------------
-- Gates: bios, intros and insights need a verified email + completed survey.
-- ---------------------------------------------------------------------------
create or replace function public.vm_can_see_bios()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not p.is_guest and p.email_verified and p.survey_score >= 70 from public.vm_profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.vm_public_profile(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.vm_can_see_bios() or p.id = auth.uid() then
    jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'photo_url', p.photo_url, 'tier', p.tier,
      'is_guest', p.is_guest, 'headline', p.headline, 'business_stage', p.business_stage, 'industry', p.industry,
      'looking_for', p.looking_for, 'skills', p.skills, 'current_project', p.current_project, 'goals', p.goals,
      'social_links', p.social_links, 'city', case when p.share_location then p.city end,
      'region', case when p.share_location then p.region end, 'last_seen_at', p.last_seen_at, 'color_ranks', p.color_ranks, 'locked', false)
  else
    jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'photo_url', p.photo_url, 'tier', p.tier,
      'is_guest', p.is_guest, 'last_seen_at', p.last_seen_at, 'color_ranks', p.color_ranks, 'locked', true)
  end
  from public.vm_profiles p where p.id = p_user_id;
$$;

-- Match suggestions: none until the caller has earned them.
create or replace function public.vm_match_suggestions_gated(p_limit int default 12)
returns table(user_id uuid, score int, reasons text[], distance_km int)
language sql stable security definer set search_path = public as $$
  select * from public.vm_match_suggestions(p_limit) where public.vm_can_see_bios();
$$;
grant execute on function public.vm_match_suggestions_gated(int) to authenticated;
revoke execute on function public.vm_match_suggestions_gated(int) from public, anon;
revoke execute on function public.vm_match_suggestions(int) from authenticated;

-- Sending an intro (friend request) needs the same standing; challenges stay open to everyone.
create or replace function public.vm_request_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if v_me = p_friend_id then raise exception 'that is you'; end if;
  if exists (select 1 from public.vm_profiles where id = v_me and is_guest) then
    raise exception 'Create a free account to add friends';
  end if;
  if not public.vm_can_see_bios() then
    raise exception 'Verify your email and complete your member profile to connect with people';
  end if;
  if exists (select 1 from public.vm_friendships where user_id = p_friend_id and friend_id = v_me and status = 'pending') then
    update public.vm_friendships set status = 'accepted' where user_id = p_friend_id and friend_id = v_me;
    return;
  end if;
  insert into public.vm_friendships (user_id, friend_id, status) values (v_me, p_friend_id, 'pending') on conflict do nothing;
end; $$;

-- Arena Record for OTHER members hides the bio fields until the viewer qualifies.
create or replace function public.vm_arena_record(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select (to_jsonb(p) - 'premium_interest' - 'premium_interest_at' - 'referral_code' - 'referred_by' - 'phone' - 'auth_provider')
                  || jsonb_build_object('city', case when p.share_location then p.city end, 'region', case when p.share_location then p.region end)
                  || case when public.vm_can_see_bios() or p.id = auth.uid() then '{}'::jsonb
                          else jsonb_build_object('headline', null, 'looking_for', null, 'goals', null, 'current_project', null, 'industry', null, 'business_stage', null, 'skills', '[]'::jsonb, 'social_links', '{}'::jsonb, 'locked', true) end
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

-- Other members' rows through the table: hide bio columns from viewers who don't qualify.
-- (Direct selects are used for lists; bios come through vm_public_profile.)
drop policy if exists "vm_profiles are readable by any signed-in user" on public.vm_profiles;
create policy "vm_profiles are readable by any signed-in user" on public.vm_profiles for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Column-level privacy on vm_profiles. Bio and contact columns are no longer
-- readable through the table by other members; the app reads its OWN full
-- row via vm_my_profile() and other members' cards via vm_profile_cards(),
-- which include bios only when the viewer qualifies (vm_can_see_bios).
-- Updates keep working: UPDATE privilege is separate and RLS limits them to
-- the owner's row.
-- ---------------------------------------------------------------------------
revoke select on public.vm_profiles from authenticated;
grant select (id, display_name, avatar, photo_url, is_guest, tier, created_at, color_ranks, last_seen_at,
              streak_count, streak_last_day, points_balance, timezone, share_location, survey_score,
              survey_bonus_awarded, onboarding_done_at, auth_provider, email_verified, premium_interest, premium_interest_at)
  on public.vm_profiles to authenticated;
grant update on public.vm_profiles to authenticated;

create or replace function public.vm_my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from public.vm_profiles p where p.id = auth.uid();
$$;
grant execute on function public.vm_my_profile() to authenticated;
revoke execute on function public.vm_my_profile() from public, anon;

create or replace function public.vm_profile_cards(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar', p.avatar, 'photo_url', p.photo_url,
      'tier', p.tier, 'is_guest', p.is_guest, 'last_seen_at', p.last_seen_at, 'color_ranks', p.color_ranks)
    || case when public.vm_can_see_bios() or p.id = auth.uid()
         then jsonb_build_object('headline', p.headline, 'business_stage', p.business_stage, 'industry', p.industry, 'locked', false)
         else jsonb_build_object('locked', true) end), '[]'::jsonb)
  from public.vm_profiles p where p.id = any(p_ids);
$$;
grant execute on function public.vm_profile_cards(uuid[]) to authenticated;
revoke execute on function public.vm_profile_cards(uuid[]) from public, anon;
