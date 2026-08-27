// ============================================================================
// Shareable recap link — no server, no account, no expiry
// ----------------------------------------------------------------------------
// Builds a small JSON summary of a finished game (standings, concepts
// touched, per-player insights) and packs it straight into a URL, base64 in
// the fragment (`#...`) rather than a server-side id. A parent or teacher
// who opens the link sees a read-only recap page
// (components/RecapViewer.jsx, mounted at the static `/recap` route in
// main.jsx) with NO round trip to any backend — the link IS the data. That
// also means it never expires and never 404s because a database got reset,
// at the cost of not being editable/revocable after the fact, which is the
// right trade for a one-time "here's how it went" note.
//
// Ported from VentureFlow's src/game/recapShare.js — see
// vf-source-snapshot-2026-08-23.md — with import paths adjusted for the
// vendor/ layout (data + game-engine live one level up from game-ui here).
// Works identically for an Arena online-mode game: `state.players` already
// carries the same shape (human/ai, holdings, badges, netWorthHistory)
// replayed client-side by lib/replay.js, so nothing else needs to change.
//
// The fragment (everything after '#') is never sent to any server on a
// normal link click/load — only the JS on the page itself reads it — so
// this is exactly as private as the link itself: whoever the sender shares
// it with, and no one else, the same as any other secret-link scheme.
import { getDifficulty, getScenario, FINANCIAL_LESSONS } from '../../data/gameConfig';
import { netWorth } from '../../game-engine/players';
import { buildInsights } from './insights';
import { getBadgeInfo } from '../../game-engine/badges';

const MAX_PAYLOAD_PLAYERS = 5; // matches ONLINE_ROOM_MAX_PLAYERS — just documents the bound, no truncation needed in practice

/** A compact, JSON-safe summary of a finished game — see the file header
 * for why this deliberately excludes the log/ledger. */
export function buildRecapPayload(state, { playedAt = Date.now() } = {}) {
  const difficulty = getDifficulty(state.difficultyId);
  const scenario = getScenario(state.scenarioId);
  const ranked = [...state.players]
    .sort((a, b) => netWorth(b, state.assetPrices) - netWorth(a, state.assetPrices))
    .slice(0, MAX_PAYLOAD_PLAYERS);

  const concepts = (state.seenLessons || [])
    .map((id) => FINANCIAL_LESSONS[id])
    .filter(Boolean)
    .map((c) => ({ icon: c.icon, title: c.title, blurb: c.blurb }));

  const standings = ranked.map((p) => ({
    name: p.name,
    avatar: p.avatar,
    type: p.type,
    netWorth: Math.round(netWorth(p, state.assetPrices)),
    isWinner: p.id === state.winnerId,
    badges: (p.badges || []).map((id) => getBadgeInfo(id)?.name).filter(Boolean),
    // Only for human players — a robot's "insights" about its own
    // portfolio aren't useful to a parent reviewing the game.
    insights: p.type === 'human' ? buildInsights(p, state.assetPrices).map((i) => i.text) : [],
  }));

  return {
    v: 1, // payload shape version — bump if a future field is added/removed
    playedAt,
    scenario: { icon: scenario.icon, name: scenario.name },
    difficulty: { icon: difficulty.icon, name: difficulty.name },
    months: state.totalMonths,
    standings,
    concepts,
  };
}

// Plain base64 rather than base64url: browsers happily carry '+', '/', '='
// in a URL fragment (it's never sent over the wire or URL-decoded by the
// browser the way a query string is), so there's nothing to gain from the
// extra character-mapping step, only somewhere new for a bug to hide.
export function encodeRecapPayload(payload) {
  const json = JSON.stringify(payload);
  // encodeURIComponent/unescape round-trip is what makes btoa (which only
  // understands Latin1) safe for a JSON string that may contain a player's
  // name in non-Latin1 characters (emoji avatars, accented names, etc).
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeRecapPayload(encoded) {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.standings)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The full shareable URL for a finished game's recap, built from
 * `window.location` so it works unmodified on whatever host this is
 * actually deployed to. */
export function buildRecapShareUrl(state) {
  const encoded = encodeRecapPayload(buildRecapPayload(state));
  return `${window.location.origin}/recap#${encoded}`;
}
