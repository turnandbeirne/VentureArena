// ============================================================================
// Shared ("Global") leaderboard — scores that outlive one browser
// ----------------------------------------------------------------------------
// game/leaderboard.js keeps a leaderboard in localStorage. That's per
// browser AND per origin, which is why a friend who played the game saw
// nobody but themselves on it, and why moving the game to a new domain
// looks like the board was wiped. This module is the shared version: one
// table in Supabase that every copy of the game reads from and writes to.
//
// Deliberately talks to PostgREST over plain `fetch` rather than pulling in
// @supabase/supabase-js. The whole interaction is two HTTP calls, and the
// game's promise is that it works offline once loaded — adding a ~40kB
// client and its dependencies to do a GET and a POST isn't a trade worth
// making.
//
// EVERY call fails soft. The global board is a bonus on top of the local
// one, so no network error, blocked request, or missing configuration is
// ever allowed to break a game that just ended: callers get `null`/`false`
// and the UI shows the local board plus an honest "couldn't reach it" note.
//
// The publishable (anon) key below is meant to be public — it's the same key
// shipped in the JS of any Supabase-backed site. What actually guards the
// table is its row-level security policy: read allowed, insert allowed,
// update and delete allowed to nobody. See the
// `ventureflow_global_scores` migration.
// ============================================================================

export const GLOBAL_LEADERBOARD_URL = 'https://iwpysmrmunirsvdrecmw.supabase.co';
// The legacy `anon` key rather than the newer `sb_publishable_...` one.
// Both are public and both are accepted by PostgREST; the anon JWT is used
// here purely because it's the form every Supabase client and example sends,
// so it's the least likely to produce a 401 that's hard to diagnose from a
// deployed site. To switch to the publishable key, replace this one value —
// nothing else changes.
export const GLOBAL_LEADERBOARD_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3cHlzbXJtdW5pcnN2ZHJlY213Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNzQwOTgsImV4cCI6MjEwMjc1MDA5OH0.R8SaEFgk3hdtDVvNSLyur7jXtGEcnr-s-ge2myKf_40';
const TABLE = 'ventureflow_scores';

// Long enough for a cold serverless response, short enough that a finished
// game never sits there spinning.
const TIMEOUT_MS = 8000;

/** Whether a backend is configured at all. Blank either constant above and
 * the whole feature disappears cleanly instead of erroring. */
export function isGlobalLeaderboardEnabled() {
  return !!(GLOBAL_LEADERBOARD_URL && GLOBAL_LEADERBOARD_KEY);
}

function headers(extra = {}) {
  return {
    apikey: GLOBAL_LEADERBOARD_KEY,
    Authorization: `Bearer ${GLOBAL_LEADERBOARD_KEY}`,
    ...extra,
  };
}

async function request(path, init = {}) {
  if (!isGlobalLeaderboardEnabled()) return null;
  // AbortController rather than Promise.race: this actually cancels the
  // request instead of leaving it running and ignored.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${GLOBAL_LEADERBOARD_URL}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: headers(init.headers),
    });
    if (!response.ok) {
      console.warn('VentureFlow: global leaderboard request failed.', response.status);
      return null;
    }
    return response;
  } catch (err) {
    // Offline, blocked, DNS, timeout — all the same to the caller.
    console.warn('VentureFlow: could not reach the global leaderboard.', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Rows come back in the database's snake_case; the rest of the app speaks
 * the same shape as the local leaderboard, so translate once, here. */
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    netWorth: row.net_worth,
    mode: row.mode,
    difficultyId: row.difficulty_id,
    scenarioId: row.scenario_id,
    weatherSeverityId: row.weather_severity_id,
    dailyChallengeDate: row.daily_challenge_date,
    monthsPlayed: row.months_played,
    playedAt: row.created_at ? Date.parse(row.created_at) : null,
    global: true,
  };
}

/**
 * The top `limit` scores, highest net worth first. Pass a
 * `dailyChallengeDate` to get that day's challenge board instead of the
 * all-time one — the two are never mixed, since a Daily Challenge run has a
 * fixed difficulty and scenario and isn't comparable to a free-play game.
 *
 * Returns an array, or `null` if the board couldn't be reached — the caller
 * needs to tell those apart to say "no scores yet" versus "couldn't load".
 */
export async function fetchGlobalScores({ limit = 25, dailyChallengeDate = null } = {}) {
  const filter = dailyChallengeDate
    ? `daily_challenge_date=eq.${encodeURIComponent(dailyChallengeDate)}`
    : 'daily_challenge_date=is.null';
  const response = await request(
    `${TABLE}?select=*&${filter}&order=net_worth.desc,created_at.asc&limit=${limit}`
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows.map(fromRow) : [];
  } catch {
    return null;
  }
}

/**
 * Submit one finished game. Returns the saved row (so the UI can highlight
 * it) or `null` on any failure — including the table's own validation
 * rejecting it, which is intentional: the CHECK constraints are the last
 * word on what a plausible score looks like, not the client.
 *
 * Note there is no email field here, unlike the local board. A shared,
 * unauthenticated, publicly-readable table is not somewhere to put an
 * address someone typed in.
 */
export async function submitGlobalScore(entry) {
  const response = await request(TABLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      name: (entry.name || '').trim().slice(0, 20),
      avatar: entry.avatar || '🙂',
      net_worth: Math.max(0, Math.round(entry.netWorth || 0)),
      mode: entry.mode || 'solo',
      difficulty_id: entry.difficultyId || null,
      scenario_id: entry.scenarioId || null,
      weather_severity_id: entry.weatherSeverityId || null,
      daily_challenge_date: entry.dailyChallengeDate || null,
      months_played: entry.monthsPlayed || null,
    }),
  });
  if (!response) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return null;
  }
}
