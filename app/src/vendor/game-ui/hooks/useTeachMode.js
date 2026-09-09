import { useCallback, useEffect, useState } from 'react';
import { getTeachMode, setTeachMode, toggleTeachMode, subscribeTeachMode } from '../game/teachMode';

/**
 * React glue for "Teach Me" mode — mirrors usePlaySpeed.js's pattern so
 * every component that reads it (the board's toggle and every LessonTip
 * anywhere in the app) stays in sync through the same framework-free store
 * in game/teachMode.js, whichever one flips it. Ported verbatim from
 * VentureFlow's src/hooks/useTeachMode.js.
 */
export function useTeachMode() {
  const [teachMode, setLocal] = useState(getTeachMode);

  useEffect(() => subscribeTeachMode(setLocal), []);

  const toggle = useCallback(() => {
    toggleTeachMode();
  }, []);

  const set = useCallback((next) => {
    setTeachMode(next);
  }, []);

  return { teachMode, toggle, setTeachMode: set };
}
