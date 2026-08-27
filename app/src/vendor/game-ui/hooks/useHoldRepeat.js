import { useCallback, useEffect, useRef } from 'react';

// How long a press has to be held before auto-repeat kicks in.
const HOLD_THRESHOLD_MS = 1000;
// Repeat starts at this interval once the hold threshold is crossed...
const START_INTERVAL_MS = 260;
// ...and speeds up by this many ms per tick...
const ACCELERATION_MS_PER_TICK = 16;
// ...down to this floor, so a long hold buys/sells a big stack quickly
// without needing a wall of individual taps.
const MIN_INTERVAL_MS = 70;

/**
 * Press-and-hold-to-repeat for the asset shop's Buy/Sell buttons. A normal
 * tap/click/Enter-press fires `action()` exactly once. Holding past
 * HOLD_THRESHOLD_MS starts auto-repeating it, and the repeat accelerates the
 * longer it's held — so scooping up (or unwinding) a big stack of one asset
 * isn't a hundred individual taps.
 *
 * `canFire()` is re-checked before every firing (the very first tap AND
 * every subsequent repeat) so it stops cleanly the moment the action would
 * fail — out of cash, out of holdings — instead of hammering a no-op.
 *
 * Uses Pointer Events (unifies mouse/touch/pen) for the hold gesture, but
 * still answers to a plain `onClick` so keyboard activation (Enter/Space on
 * a focused button) keeps working — pointerdown marks that click as already
 * handled so it doesn't fire a second time.
 */
export function useHoldRepeat(action, canFire) {
  const timeoutRef = useRef(null);
  const intervalMsRef = useRef(START_INTERVAL_MS);
  const suppressClickRef = useRef(false);
  const actionRef = useRef(action);
  const canFireRef = useRef(canFire);
  actionRef.current = action;
  canFireRef.current = canFire;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    intervalMsRef.current = START_INTERVAL_MS;
  }, []);

  const scheduleRepeat = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      if (!canFireRef.current()) {
        clearTimers();
        return;
      }
      actionRef.current();
      intervalMsRef.current = Math.max(MIN_INTERVAL_MS, intervalMsRef.current - ACCELERATION_MS_PER_TICK);
      scheduleRepeat();
    }, intervalMsRef.current);
  }, [clearTimers]);

  const onPointerDown = useCallback(
    (e) => {
      // Only the primary mouse button (touch/pen has no `.button`).
      if (e.button !== undefined && e.button !== 0) return;
      if (!canFireRef.current()) return;
      clearTimers();
      suppressClickRef.current = true;
      actionRef.current();
      timeoutRef.current = setTimeout(() => {
        intervalMsRef.current = START_INTERVAL_MS;
        scheduleRepeat();
      }, HOLD_THRESHOLD_MS);
    },
    [clearTimers, scheduleRepeat]
  );

  const onPointerUp = useCallback(() => {
    clearTimers();
    // Safety-net reset in case a click never follows (e.g. the pointer was
    // dragged off the button before release) — scheduled for the next tick
    // so a click that DOES fire in this same gesture still sees `true` and
    // gets correctly skipped.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [clearTimers]);

  const onClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // No preceding pointerdown means this was a keyboard activation.
    if (canFireRef.current()) actionRef.current();
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  return { onPointerDown, onPointerUp, onPointerLeave: onPointerUp, onPointerCancel: onPointerUp, onClick };
}
