-- ============================================================================
-- 0009 — Tighten function grants (from the Supabase security advisor)
-- ----------------------------------------------------------------------------
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which on
-- Supabase means the anon role can hit them over /rest/v1/rpc. Nothing in
-- the Arena layer should be callable without a session, and two helpers
-- must not be callable by members at all: vm_award_points (points are only
-- ever awarded by other security-definer functions and the service role)
-- and vm_game_module_digest (an integrity check for engine uploads).
-- ============================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'vm\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
revoke execute on function public.vm_award_points(uuid, text, int, uuid) from authenticated;
revoke execute on function public.vm_game_module_digest(text, int) from authenticated;
-- Trigger functions are never called directly; keep them off the API surface too.
revoke execute on function public.vm_handle_new_user() from authenticated;
revoke execute on function public.vm_handle_user_update() from authenticated;
revoke execute on function public.vm_touch_dm_thread() from authenticated;
revoke execute on function public.vm_touch_forum_topic() from authenticated;
alter function public.vm_arena_rank(int, int, int) set search_path = public;
