import { useCallback, useEffect, useState } from 'react';
import {
  PLAY_SPEEDS,
  getPlaySpeedId,
  getPlaySpeedConfig,
  setPlaySpeedId,
  playSpeedIndex,
  subscribePlaySpeed,
} from '../game/playSpeed';

/**
 * React glue for the play-speed setting — stays in sync across every
 * component that reads it (the board's slider, the landing/setup screens,
 * and useGame's own turn timers), because they all subscribe to the same
 * framework-free store in game/playSpeed.js.
 */
export function usePlaySpeed() {
  const [id, setId] = useState(getPlaySpeedId);

  useEffect(() => subscribePlaySpeed(setId), []);

  const setSpeedId = useCallback((nextId) => {
    setPlaySpeedId(nextId);
  }, []);

  const setSpeedIndex = useCallback((index) => {
    const speed = PLAY_SPEEDS[Math.min(PLAY_SPEEDS.length - 1, Math.max(0, Number(index) || 0))];
    if (speed) setPlaySpeedId(speed.id);
  }, []);

  return {
    speedId: id,
    speed: getPlaySpeedConfig(id),
    index: playSpeedIndex(id),
    speeds: PLAY_SPEEDS,
    setSpeedId,
    setSpeedIndex,
  };
}
