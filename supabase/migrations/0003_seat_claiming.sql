-- ============================================================================
-- Let a room actually be joined by someone other than its host.
-- ----------------------------------------------------------------------------
-- 0001_init.sql's "the room host can manage vm_room_seats" policy is a FOR
-- ALL policy scoped to the host — which means, as originally written, ONLY
-- the host could ever write a vm_room_seats row. A friend following an
-- invite link had no way to seat themselves; every seat had to be assigned
-- by the host up front. This migration adds the missing piece: a seat can
-- now be created genuinely OPEN (both user_id and bot_personality_id null —
-- "reserved, waiting for a human"), and any authenticated user can claim an
-- open seat for themselves (and vacate a seat they hold), without gaining
-- any ability to touch a seat they don't hold or that's already taken. The
-- host's existing "manage everything" policy (assign AI seats, reassign,
-- fill remaining seats before starting, etc.) is untouched.
-- ============================================================================

alter table public.vm_room_seats
  drop constraint if exists vm_room_seats_has_an_occupant;
alter table public.vm_room_seats
  add constraint vm_room_seats_not_double_occupied
    check (not (user_id is not null and bot_personality_id is not null));

create policy "a user can claim an open vm_room_seats seat for themselves"
  on public.vm_room_seats for update
  to authenticated
  using (user_id is null and bot_personality_id is null)
  with check (auth.uid() = user_id);

create policy "a user can vacate a vm_room_seats seat they hold"
  on public.vm_room_seats for update
  to authenticated
  using (auth.uid() = user_id)
  with check (user_id is null and bot_personality_id is null);
