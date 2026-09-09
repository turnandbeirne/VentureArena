import { useCallback, useEffect, useState } from 'react';
import { getMusicSettings, setMusicVolume, toggleMusicMuted, subscribeMusicSettings } from '../audio/musicEngine';

/** React glue for the music volume/mute control — mirrors useAudioSettings.js
 * but for background music, which has its own independent volume/mute so it
 * can be mixed separately from sound effects. Stays in sync across
 * components (setup/board/game-over each render their own MusicControl). */
export function useMusicSettings() {
  const [settings, setSettings] = useState(getMusicSettings);

  useEffect(() => subscribeMusicSettings(setSettings), []);

  const changeVolume = useCallback((value) => {
    setMusicVolume(value);
  }, []);

  const toggle = useCallback(() => {
    toggleMusicMuted();
  }, []);

  return { ...settings, setVolume: changeVolume, toggleMuted: toggle };
}
