import { useMusicSettings } from '../hooks/useMusicSettings';

function musicIcon(muted, volume) {
  if (muted || volume <= 0) return '🔇';
  return '🎵';
}

/** Volume/mute control for background music — visually matches
 * VolumeControl.jsx (same pill/slider styling) but drives the separate
 * music engine, so a player can mix music down independently of sound
 * effects. Rendered alongside VolumeControl on every screen. */
export default function MusicControl() {
  const { volume, muted, setVolume, toggleMuted } = useMusicSettings();

  return (
    <div className="vf-volume" title="Music volume">
      <button
        type="button"
        className="vf-btn vf-btn--sm vf-btn--ghost vf-volume__toggle"
        onClick={toggleMuted}
        aria-label={muted ? 'Unmute music' : 'Mute music'}
        title={muted ? 'Unmute music' : 'Mute music'}
      >
        {musicIcon(muted, volume)}
      </button>
      <input
        className="vf-volume__slider"
        type="range"
        min="0"
        max="100"
        value={Math.round(volume * 100)}
        disabled={muted}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        aria-label="Music volume"
      />
    </div>
  );
}
