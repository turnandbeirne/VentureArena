// ============================================================================
// "Teach Me" mode — on-demand financial-concept tooltips
// ----------------------------------------------------------------------------
// A framework-free settings store (exactly the same shape as
// game/playSpeed.js: load from localStorage, notify subscribers, persist on
// change), read by React through hooks/useTeachMode.js.
//
// This is deliberately a DEVICE preference, not part of game state — same
// category as play speed or volume, not something that needs to replay
// deterministically or sync across a shared save. It can be flipped on or
// off at any point, mid-game included, and the very next render of every
// LessonTip (components/LessonTip.jsx) picks it up.
//
// Ported verbatim from VentureFlow's src/game/teachMode.js — see
// vf-source-snapshot-2026-08-23.md. Distinct from game-engine/lessons.js's
// existing "why" layer: that one is a surprise, one-shot callout in the
// event log the FIRST time a concept's moment happens in a game, whether or
// not Teach Me is on. This layer is the opposite — always available, on
// demand, for as many concepts as a curious player (or a parent/teacher
// sitting with them) wants to tap through, any number of times, for as long
// as Teach Me stays on. Both layers read the same FINANCIAL_LESSONS content
// (data/gameConfig.js) so the wording never drifts between the two.
// ============================================================================

const STORAGE_KEY = 'ventureflow-teach-me-v1';

function loadTeachMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = loadTeachMode();
const listeners = new Set();

export function getTeachMode() {
  return enabled;
}

export function setTeachMode(next) {
  enabled = !!next;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Storage unavailable — the setting still applies for the rest of this
    // session, it just won't be remembered next visit.
  }
  for (const listener of listeners) listener(enabled);
}

export function toggleTeachMode() {
  setTeachMode(!enabled);
}

export function subscribeTeachMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
