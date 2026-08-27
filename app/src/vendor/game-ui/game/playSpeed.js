// ============================================================================
// Play speed — how fast the table plays itself
// ----------------------------------------------------------------------------
// A framework-free settings store (exactly the same shape as
// audio/soundEngine.js's and musicEngine.js's: load from localStorage,
// notify subscribers, persist on change), read by React through
// hooks/usePlaySpeed.js.
//
// WHY THIS EXISTS: robot turns used to resolve as a single burst — the whole
// turn ran in one `RUN_AI_TURN` dispatch, so four separate decisions and
// their four log lines all appeared in the same frame, 700ms after the
// previous player finished. Fast, but impossible to read: a player couldn't
// see that the bot bought a Tree House BECAUSE the weather turned sunny, or
// that its income jumped BECAUSE it ran a campaign. Cause and effect were
// simultaneous.
//
// So there are two separate changes working together here:
//   1. game/aiEngine.js gained `runAiStep()` — ONE decision at a time — and
//      the reducer/useGame drive it step by step (see reducer.js's
//      RUN_AI_STEP), so each robot action lands on its own beat with its own
//      log line and its own sound.
//   2. The gap between those beats, between turns, and between month-end
//      recap cards is what this file controls — five notches, changeable at
//      any point mid-game (nothing here is baked into game state), and
//      remembered for next time.
//
// Every delay is expressed per-speed in real milliseconds rather than as a
// multiplier over one base number, because the three delays don't scale
// together evenly: a slow setting wants a LOT of room between a robot's
// individual actions (that's the whole point) but only a little extra
// between turns, or the handoff starts to feel broken rather than
// deliberate.
// ============================================================================

const STORAGE_KEY = 'ventureflow-speed-v1';

/**
 * The notches, slowest first — the order the slider shows them in.
 *
 * - `aiStepMs`      — pause before each individual robot decision.
 * - `turnHandoffMs` — pause after a robot's last action, before the turn passes.
 * - `recapAdvanceMs`— pause before auto-advancing past a ROBOT's fortune-card
 *                     recap (a human's card always waits for a real click).
 * - `spotlightMs`   — how long the spotlight takes to travel to the next
 *                     player's card (components/PlayerPanel.jsx). Kept
 *                     proportional to the handoff so the light is settling in
 *                     just as the new turn begins, never still sliding.
 */
export const PLAY_SPEEDS = [
  {
    id: 'storyteller',
    name: 'Storyteller',
    icon: '🐢',
    blurb: 'Slowest — read every single move as it happens.',
    aiStepMs: 2200,
    turnHandoffMs: 1900,
    recapAdvanceMs: 1900,
    spotlightMs: 1100,
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    icon: '🐌',
    blurb: 'Plenty of room to follow what the robots are doing.',
    aiStepMs: 1500,
    turnHandoffMs: 1250,
    recapAdvanceMs: 1250,
    spotlightMs: 800,
  },
  {
    id: 'steady',
    name: 'Steady',
    icon: '🚶',
    blurb: 'The default — one clear beat per move.',
    aiStepMs: 950,
    turnHandoffMs: 800,
    recapAdvanceMs: 800,
    spotlightMs: 550,
  },
  {
    id: 'brisk',
    name: 'Brisk',
    icon: '🏃',
    blurb: 'Closest to how the game used to play.',
    aiStepMs: 520,
    turnHandoffMs: 450,
    recapAdvanceMs: 450,
    spotlightMs: 380,
  },
  {
    id: 'zippy',
    name: 'Zippy',
    icon: '⚡',
    blurb: 'Fastest — for players who already know the game cold.',
    aiStepMs: 230,
    turnHandoffMs: 220,
    recapAdvanceMs: 200,
    spotlightMs: 220,
  },
];

// 'steady' rather than 'brisk': a new player learning the game is the one
// who most needs to see cause and effect, and anyone who finds it slow can
// move the slider in one click, from the board, mid-game.
export const DEFAULT_PLAY_SPEED_ID = 'steady';

export function getPlaySpeedConfig(id) {
  return PLAY_SPEEDS.find((s) => s.id === id) || PLAY_SPEEDS.find((s) => s.id === DEFAULT_PLAY_SPEED_ID);
}

/** Where a speed sits on the slider (0 = slowest). */
export function playSpeedIndex(id) {
  const i = PLAY_SPEEDS.findIndex((s) => s.id === id);
  return i === -1 ? PLAY_SPEEDS.findIndex((s) => s.id === DEFAULT_PLAY_SPEED_ID) : i;
}

let speedId = loadSpeed();
const listeners = new Set();

function loadSpeed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAY_SPEED_ID;
    // Validated against the current list rather than trusted: a speed id
    // saved by an older build (or hand-edited) must fall back to the
    // default instead of leaving the game with undefined delays.
    return PLAY_SPEEDS.some((s) => s.id === raw) ? raw : DEFAULT_PLAY_SPEED_ID;
  } catch {
    return DEFAULT_PLAY_SPEED_ID;
  }
}

export function getPlaySpeedId() {
  return speedId;
}

export function getPlaySpeed() {
  return getPlaySpeedConfig(speedId);
}

export function setPlaySpeedId(id) {
  if (!PLAY_SPEEDS.some((s) => s.id === id)) return;
  speedId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable — the setting still applies for this session.
  }
  for (const listener of listeners) listener(speedId);
}

/** Move `steps` notches along the slider (negative = slower), clamped. */
export function nudgePlaySpeed(steps) {
  const next = Math.min(PLAY_SPEEDS.length - 1, Math.max(0, playSpeedIndex(speedId) + steps));
  setPlaySpeedId(PLAY_SPEEDS[next].id);
}

export function subscribePlaySpeed(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
