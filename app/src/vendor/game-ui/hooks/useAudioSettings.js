import { useCallback, useEffect, useState } from 'react';
import {
  getAudioSettings,
  setVolume,
  toggleMuted,
  subscribeAudioSettings,
  playSound,
} from '../audio/soundEngine';

/** React glue for the volume/mute control — stays in sync across components. */
export function useAudioSettings() {
  const [settings, setSettings] = useState(getAudioSettings);

  useEffect(() => subscribeAudioSettings(setSettings), []);

  const changeVolume = useCallback((value) => {
    setVolume(value);
  }, []);

  const toggle = useCallback(() => {
    toggleMuted();
    // Give a little feedback tone right as you unmute so it's obvious it
    // worked. Called synchronously (not via setTimeout) so that if this is
    // literally the first sound the page ever tries to play, it still
    // happens inside the click's own call stack — iOS Safari only unlocks
    // the AudioContext when a sound is triggered directly from a user
    // gesture handler, not from a deferred callback.
    playSound('click');
  }, []);

  return { ...settings, setVolume: changeVolume, toggleMuted: toggle };
}
