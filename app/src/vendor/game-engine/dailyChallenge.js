// ============================================================================
// Daily Challenge — same seed, same setup, for everyone who plays it today
// ----------------------------------------------------------------------------
// A quick-start option on the setup screen: skips picking a scenario,
// difficulty, and bot opponents (all fixed, so every player's run is a fair
// apples-to-apples comparison) and seeds game/rng.js from today's date, so
// the weather timeline, fortune-card draws, and price-drift noise are
// identical for every player who plays today — differences in the final
// score come from player choices, not random luck. Scores save to a
// separate leaderboard segment (see game/leaderboard.js) keyed by date.
// ============================================================================
import { DEFAULT_DIFFICULTY_ID } from '../data/gameConfig';
import { DEFAULT_SCENARIO_ID } from './scenarios';

// A fixed two-robot table, not player-chosen — everyone's daily-challenge
// opponents are the same, which is part of what makes the scores
// comparable (only the human seat's choices differ between players).
export const DAILY_CHALLENGE_BOT_CONFIGS = [
  { personalityId: 'bossemby', skillLevelId: 'sharp' },
  { personalityId: 'mrgrinch', skillLevelId: 'sharp' },
];
export const DAILY_CHALLENGE_DIFFICULTY_ID = DEFAULT_DIFFICULTY_ID;
export const DAILY_CHALLENGE_SCENARIO_ID = DEFAULT_SCENARIO_ID;

/** Today's UTC date as 'YYYY-MM-DD' — the identity of "today's challenge"
 * (UTC, so it doesn't quietly change mid-evening depending on a player's
 * own timezone) and also what today's leaderboard segment is keyed by (see
 * game/leaderboard.js). */
export function todayChallengeDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Wordle-style shareable result text for a just-finished Daily Challenge
 * run: a final net-worth figure plus a month-by-month "shape" of the
 * journey (🟩 grew / ⬜ held steady / 🟥 shrank that month, vs a flat ±2%
 * threshold — 🟦 marks the starting month, which has nothing to compare
 * against yet) rather than exact per-month numbers, so it's fun to compare
 * with friends without spoiling anything about the (identical, shared)
 * weather/card timeline for anyone who hasn't played today's challenge yet.
 * Pure string — no login/account needed, just copy-paste anywhere.
 */
export function buildDailyChallengeShareText({ dateString, finalNetWorth, netWorthHistory, rank }) {
  const trend = (netWorthHistory || [])
    .map((entry, i) => {
      if (i === 0) return '🟦';
      const prev = netWorthHistory[i - 1].netWorth;
      const diff = entry.netWorth - prev;
      const pct = prev !== 0 ? diff / prev : diff > 0 ? 1 : 0;
      if (pct > 0.02) return '🟩';
      if (pct < -0.02) return '🟥';
      return '⬜';
    })
    .join('');
  const rankLine = rank ? `\n🏅 Leaderboard rank: #${rank}` : '';
  return `VentureFlow Daily Challenge — ${dateString}\n💰 Final net worth: $${Math.round(finalNetWorth || 0).toLocaleString()}${rankLine}\n${trend}\nPlay today's challenge yourself at VentureMaker!`;
}

/** A small, fast string hash (djb2) turned into a seed for game/rng.js's
 * seedRng() — deterministic per date string, so every player who opens the
 * game on the same UTC date gets the exact same seed, and therefore the
 * exact same weather timeline, fortune-card draws, and price-drift noise. */
export function seedForDate(dateString) {
  let hash = 5381;
  for (let i = 0; i < dateString.length; i++) {
    hash = (hash * 33) ^ dateString.charCodeAt(i);
  }
  return hash >>> 0;
}
