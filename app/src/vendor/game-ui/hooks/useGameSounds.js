import { useEffect, useRef } from 'react';
import { playSound } from '../audio/soundEngine';
import { SOUNDS } from '../audio/soundLibrary';

/**
 * Resolve a log entry's `kind` to a sound name. Most kinds map straight to
 * an identically-named entry in SOUNDS (e.g. 'badge', 'weather'). Buy/sell
 * are asset-specific ('buy_piggy', 'sell_treasure', ...) so each asset gets
 * its own personality; if a future asset added to gameConfig.js doesn't
 * have a matching entry yet, this falls back to the generic 'buy'/'sell'
 * sound rather than staying silent.
 */
function resolveSound(entry) {
  const kind = entry?.kind;
  if (!kind) return null;
  // Weather carries its stage's mood along (see game/turnEngine.js) so it
  // can pick a good-weather (birds) vs bad-weather (thunder) cue instead of
  // one generic shimmer for every stage — same boom/peak/rebound = good,
  // dip/bust = bad split as game/aiEngine.js's isGoodWeather().
  if (kind === 'weather') return entry.mood === 'dip' || entry.mood === 'bust' ? 'weatherBad' : 'weatherGood';
  if (SOUNDS[kind]) return kind;
  if (kind.startsWith('buy_')) return 'buy';
  if (kind.startsWith('sell_')) return 'sell';
  // A scenario objective landing reuses the badge chime (it IS a kind of
  // achievement); a lead change gets the bigger crowd-cheering sound
  // (SOUNDS.cheering, the same one layered into the game-over fanfare) —
  // see game/scenarios.js and game/turnEngine.js for what triggers these.
  if (kind === 'objectiveMet') return 'badge';
  if (kind === 'leadChange') return 'cheering';
  // Investing in a business reuses the "leveling up" skill chime; an R&D
  // project actually paying off (see game/businessUpgrades.js) reuses the
  // achievement badge chime — see game/turnEngine.js for what triggers each.
  if (kind === 'businessUpgrade') return 'skill';
  if (kind === 'businessRnd') return 'badge';
  // A bonus Piggy Bank interest month (see game/turnEngine.js) reuses the
  // Piggy Bank's own cheerful little "boop" rather than getting a new sound.
  if (kind === 'interestBonus') return 'buy_piggy';
  return null;
}

/**
 * Reactive sound layer: watches the shared event log and plays a sound for
 * every newly-appended entry whose `kind` maps to an effect. This keeps the
 * game engine (src/game/) completely unaware that audio exists — it just
 * tags entries with a `kind`, same as it always logged messages, and this
 * hook is the only thing that turns that into noise.
 *
 * Works uniformly for human and AI turns, and across every screen (mounted
 * once in App.jsx), so it doesn't matter who triggered the event.
 */
export function useGameSounds(log) {
  const seenCountRef = useRef(null);

  useEffect(() => {
    if (!log) {
      // No active game (setup screen, or just started a new one) — reset
      // so the next game doesn't think it's already "seen" old entries.
      seenCountRef.current = null;
      return;
    }

    if (seenCountRef.current === null) {
      // First time we see this game's log (fresh start OR resumed from
      // localStorage) — don't replay its whole history, just start
      // watching from here.
      seenCountRef.current = log.length;
      return;
    }

    if (log.length > seenCountRef.current) {
      const newEntries = log.slice(seenCountRef.current);
      for (const entry of newEntries) {
        const soundName = resolveSound(entry);
        if (soundName) playSound(soundName);
      }
      seenCountRef.current = log.length;
    } else if (log.length < seenCountRef.current) {
      // Log got trimmed/reset somehow — just resync quietly.
      seenCountRef.current = log.length;
    }
  }, [log]);
}
