import { useAudioSettings } from '../hooks/useAudioSettings';

function speakerIcon(muted, volume) {
  if (muted || volume <= 0) return '🔇';
  if (volume < 0.4) return '🔈';
  if (volume < 0.75) return '🔉';
  return '🔊';
}

export default function VolumeControl() {
  const { volume, muted, setVolume, toggleMuted } = useAudioSettings();

  return (
    <div className="vf-volume">
      <button
        type="button"
        className="vf-btn vf-btn--sm vf-btn--ghost vf-volume__toggle"
        onClick={toggleMuted}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {speakerIcon(muted, volume)}
      </button>
      <input
        className="vf-volume__slider"
        type="range"
        min="0"
        max="100"
        value={Math.round(volume * 100)}
        disabled={muted}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        aria-label="Sound volume"
      />
    </div>
  );
}
