-- ============================================================================
-- Up to 5 mixed human/AI seats per room, plus missing-in-action takeover.
-- ----------------------------------------------------------------------------
-- Builds on 0001_init.sql (vm_-prefixed tables). Run this after it, same way
-- (SQL Editor via Lovable's Supabase panel, or `supabase db push`).
-- ============================================================================

-- How long a seat can go silent on its own turn before the scheduled
-- sweep-missing-players function hands it to an AI stand-in (see
-- turnEngine.js's convertSeatToAi and that function's own comment). Set at
-- room creation; the host can tune it for a slower/faster-paced room.
alter table public.vm_rooms
  add column if not exists turn_timeout_hours int not null default 48;

-- vm_room_seats already supports a bot seat (bot_personality_id set, user_id
-- null) via 0001_init.sql's vm_room_seats_exactly_one_occupant constraint — a
-- room can already mix up to 5 human and AI seats (enforced in the app /
-- resolve-move function against ONLINE_ROOM_MIN_PLAYERS..ONLINE_ROOM_MAX_
-- PLAYERS from VentureFlow's gameConfig.js, not the database, since "how
-- many players a game supports" is a game-engine concern, not a platform
-- one — a future VentureMaker title could allow a different range). Nothing
-- schema-side to add for the room-size increase itself.

-- `bot_personality_id` on a vm_room_seats row that started as a HUMAN seat
-- and was later taken over records which personality is now playing it,
-- kept in sync with the authoritative value inside game state (players[i].
-- personalityId) purely for lobby/UI display (e.g. "Alice (now played by
-- Bossemby)") without a client having to replay the whole move log just to
-- show that. The authoritative value is always the replayed game state —
-- this column is a display cache, and resolve-move/sweep-missing-players
-- both write it whenever they process a CONVERT_SEAT_TO_AI move.
comment on column public.vm_room_seats.bot_personality_id is
  'Bot personality for an AI seat, OR — if user_id is also set — the personality now standing in after a resign/missing-in-action takeover. Display cache; authoritative value lives in replayed game state (players[i].personalityId).';

alter table public.vm_room_seats
  drop constraint if exists vm_room_seats_exactly_one_occupant;
alter table public.vm_room_seats
  add constraint vm_room_seats_has_an_occupant
    check (user_id is not null or bot_personality_id is not null);
