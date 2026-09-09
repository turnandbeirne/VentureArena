// ============================================================================
// Leaderboard — persistent high-score list (separate from game save/resume)
// ----------------------------------------------------------------------------
// Stored in its own localStorage key so it survives "New Game" / "Play
// Again" and isn't tied to any single in-progress game. Entries are opt-in:
// nothing is saved here automatically when a game ends — a player chooses
// to add their result (see GameOverScreen).
//
// `email` is stored on the entry (so it's there if VentureMaker ever wants
// to follow up about a milestone, a future VentureScouts tie-in, etc.) but
// is NEVER read by any rendering code — see LeaderboardModal.jsx, which
// only ever reads name/avatar/netWorth/mode/difficultyId/playedAt/portfolio
// off an entry.
//
// `portfolio` is an optional frozen "hard copy" snapshot of the winner's
// assets/businesses/avg-purchase-prices at the moment they saved their
// score (see GameOverScreen's buildPortfolioSnapshot) — it never changes
// again even if they go play another game, so the leaderboard remembers
// exactly how that win was built.
// ============================================================================
import { LEADERBOARD_STORAGE_KEY, LEADERBOARD_MAX_ENTRIES } from '../../data/gameConfig';

export function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable — the score just won't be remembered next visit.
  }
}

/**
 * Add a new leaderboard entry. Returns { entries, entry, rank } — the
 * updated, sorted (desc by net worth), capped list; the entry just created
 * (so callers can e.g. highlight it without guessing at sort order/ties);
 * and its 1-based rank in that list (so callers can tell e.g. "top 20").
 * `email` is optional and private (see header). `portfolio` is an optional
 * frozen snapshot (see header) — stored as-is, never read for rendering
 * except by the leaderboard's own expandable detail view.
 */
export function addLeaderboardEntry({ name, avatar, netWorth, mode, difficultyId, email, portfolio, dailyChallengeDate }) {
  const entries = loadLeaderboard();
  const entry = {
    id: `lb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 20),
    avatar: avatar || '🙂',
    netWorth: Math.round(netWorth),
    mode: mode || 'solo',
    difficultyId: difficultyId || null,
    email: email ? email.trim() : null,
    portfolio: portfolio || null,
    // Set only for a Daily Challenge run (see game/dailyChallenge.js) — the
    // 'YYYY-MM-DD' the challenge was played on, used to segment a separate
    // "Today's Challenge" leaderboard view (see LeaderboardModal.jsx) where
    // every entry played the identical weather/cards, so scores are a fair
    // apples-to-apples comparison. Regular runs leave this null.
    dailyChallengeDate: dailyChallengeDate || null,
    playedAt: Date.now(),
  };

  const next = [...entries, entry].sort((a, b) => b.netWorth - a.netWorth).slice(0, LEADERBOARD_MAX_ENTRIES);
  persist(next);
  const rank = next.findIndex((e) => e.id === entry.id) + 1; // 0 if capped out of the list entirely
  return { entries: next, entry, rank };
}

export function clearLeaderboard() {
  persist([]);
  return [];
}
