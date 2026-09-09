import { useCallback, useState } from 'react';
import { resolveMove } from '../../lib/supabaseClient.js';

/**
 * Adapts an Arena room (rng_seed + persisted vm_moves, replayed client-side
 * by lib/replay.js) into an interface shaped like VentureFlow's own
 * hooks/useGame.js — see vf-source-snapshot-2026-08-23.md for the exact
 * shape being matched. That's what lets ArenaGameBoard.jsx drive the
 * vendored game-ui components (ActionBar, AssetShop, PlayerPanel, the
 * modals...) with the same props those components already expect, instead
 * of rewriting each one for Arena.
 *
 * Every method here does exactly one thing: submit a reducer action to the
 * resolve-move edge function, which is the ONLY thing that ever actually
 * advances a room's game state (see resolve-move/index.ts) — this hook
 * never runs the reducer itself. `onChanged` (passed in from RoomScreen) is
 * awaited afterward so the caller's next render sees the fresh replayed
 * state; the realtime subscription on vm_moves also picks up moves other
 * players/AI make, so this isn't the only way state updates, just the way
 * a move THIS client made confirms immediately instead of waiting on the
 * realtime round trip.
 *
 * Deliberately smaller than useGame()'s real interface:
 *  - No state/startGame/newGame/hasSavedGame — a room's game starts once,
 *    from SeatingPanel's "Start Game", and is never restarted in place.
 *    ArenaGameBoard renders its own "Leave Room" action instead of
 *    VentureFlow's "New Game" button.
 *  - No startTurnTimer/extendTurn — VentureFlow's 30s chess clock isn't
 *    part of this port; Arena has its own separate idle-timeout/AI-takeover
 *    system (turn_timeout_minutes, break_until, REQUEST_BREAK) that stays as
 *    Arena's own mechanism. See ArenaGameBoard for the (new) client-side
 *    warning banner for THAT system.
 *  - ackStartupLaunch/clearError are local-only (see below) — nothing to
 *    submit to the server for either.
 *  - convertSeatToAi is new: resigns the CALLER's own seat to AI control
 *    (⚠️ ARENA-ONLY reducer case — see game-engine/reducer.js).
 *
 * Every method below accepts (and ignores) a leading `playerId` argument
 * the same way useGame()'s real methods take one — so call sites written
 * against that interface don't need an Arena-specific branch. It's ignored
 * because the server always forces the actual playerId server-side from
 * the caller's own seat (resolve-move/index.ts's `{...o, playerId: f}`) —
 * a client couldn't spoof a different player's id even if it tried.
 */
export function useOnlineGame({ roomId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(
    async (action) => {
      setError(null);
      setBusy(true);
      try {
        await resolveMove(roomId, action);
        await onChanged();
      } catch (err) {
        setError(err?.message || 'That move was rejected');
      } finally {
        setBusy(false);
      }
    },
    [roomId, onChanged]
  );

  const buyAsset = useCallback((_playerId, assetId, qty) => submit({ type: 'BUY_ASSET', assetId, qty }), [submit]);
  const sellAsset = useCallback((_playerId, assetId, qty) => submit({ type: 'SELL_ASSET', assetId, qty }), [submit]);
  // `name` is the player's chosen business name from StartBusinessModal (or
  // undefined/blank if they just tapped a suggestion tile without picking
  // one — actions.js falls back to its own random pick either way). Matches
  // the same `action.name` field VentureFlow's own useGame.js sends — see
  // game-engine/reducer.js's START_BUSINESS case.
  const startBusiness = useCallback((_playerId, name) => submit({ type: 'START_BUSINESS', name }), [submit]);
  const learnSkill = useCallback(() => submit({ type: 'LEARN_SKILL' }), [submit]);
  const upgradeBusiness = useCallback(
    (_playerId, businessId, trackId) => submit({ type: 'UPGRADE_BUSINESS', businessId, trackId }),
    [submit]
  );
  const endTurn = useCallback(() => submit({ type: 'END_TURN' }), [submit]);
  const resolveExitOffer = useCallback((_playerId, accept) => submit({ type: 'RESOLVE_EXIT_OFFER', accept }), [submit]);
  const sendChat = useCallback(
    (_playerId, message, targetPlayerId) => submit({ type: 'SEND_CHAT', message, targetPlayerId: targetPlayerId || undefined }),
    [submit]
  );

  // ACK_FORTUNE_CARD is real and server-submittable, but ArenaGameBoard is
  // careful about WHEN it calls this — every connected client replays the
  // same shared state, and the reducer's acknowledgeFortuneCard() has no
  // idempotency guard, so if every client called this for the same entry
  // fortuneRecapIndex would over-advance. See ArenaGameBoard's fortune-card
  // effect for the elected-single-client rule this is built to support.
  const ackFortuneCard = useCallback(() => submit({ type: 'ACK_FORTUNE_CARD' }), [submit]);

  // Ends the 'gameEnding' pause (the final month's "that's a wrap" beat —
  // see game-engine/turnEngine.js's acknowledgeFortuneCard/finalizeGameOver)
  // and shows the actual Game Over screen. Unlike ACK_FORTUNE_CARD, this one
  // is safe for EVERY connected client to submit (not just an elected one):
  // finalizeGameOver() is a pure no-op once status is already 'gameover', so
  // ArenaGameBoard.jsx's countdown timer fires this from every client
  // without needing the elected-single-client dance.
  const finalizeGameOver = useCallback(() => submit({ type: 'FINALIZE_GAME_OVER' }), [submit]);

  const convertSeatToAi = useCallback(() => submit({ type: 'CONVERT_SEAT_TO_AI' }), [submit]);

  // Local-only stand-ins so vendored components can call these props
  // unconditionally without ArenaGameBoard needing a special case:
  //  - clearError: the vendored error toast auto-dismisses by calling this;
  //    "error" here is this hook's own local state from a rejected
  //    resolveMove, not reducer state, so clearing it is just a setState.
  //  - ackStartupLaunch: pendingLaunch is real replayed reducer state, but
  //    ACK_STARTUP_LAUNCH was deliberately left off resolve-move's
  //    client-submittable action set — it's purely cosmetic and only ever
  //    shown to the launching player, so ArenaGameBoard tracks "have I
  //    dismissed this one" itself (by businessId) instead of asking the
  //    server to forget it for everyone.
  const clearError = useCallback(() => setError(null), []);
  const ackStartupLaunch = useCallback(() => {}, []);

  return {
    busy,
    error,
    buyAsset,
    sellAsset,
    startBusiness,
    learnSkill,
    upgradeBusiness,
    endTurn,
    resolveExitOffer,
    sendChat,
    ackFortuneCard,
    finalizeGameOver,
    convertSeatToAi,
    clearError,
    ackStartupLaunch,
  };
}
