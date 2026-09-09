import { usePlaySpeed } from '../hooks/usePlaySpeed';
import { playSound } from '../audio/soundEngine';

/**
 * The play-speed slider — five notches from 🐢 Storyteller to ⚡ Zippy.
 *
 * Shown in the board header (so it can be changed mid-game, mid-turn, which
 * is the entire point) and on the landing/setup screens. It's a real
 * `<input type="range">` rather than a set of buttons so the "slow it down a
 * notch or two" gesture is one drag, and so it's keyboard- and
 * screen-reader-accessible for free.
 *
 * Nothing about the speed lives in game state — it's a device preference in
 * game/playSpeed.js — so changing it never touches the save file and applies
 * to whatever game happens to be running.
 */
export default function SpeedControl({ compact = true }) {
  const { speed, index, speeds, setSpeedIndex } = usePlaySpeed();

  function handleChange(e) {
    const next = Number(e.target.value);
    if (next !== index) {
      setSpeedIndex(next);
      playSound('click');
    }
  }

  return (
    <label className={`vf-speed ${compact ? 'vf-speed--compact' : ''}`} title={`Play speed: ${speed.name} — ${speed.blurb}`}>
      <span className="vf-speed__icon" aria-hidden="true">
        {speed.icon}
      </span>
      <input
        className="vf-speed__range"
        type="range"
        min={0}
        max={speeds.length - 1}
        step={1}
        value={index}
        onChange={handleChange}
        aria-label={`Play speed: ${speed.name}`}
      />
      <span className="vf-speed__name">{speed.name}</span>
    </label>
  );
}
