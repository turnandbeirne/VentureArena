// ============================================================================
// Name filter — blocks offensive player names (setup + leaderboard entries)
// ----------------------------------------------------------------------------
// Two-tier check, tuned to avoid the classic profanity-filter false positive
// (blocking "Cassandra" because it contains "ass"):
//
//   EXACT_WORD_TERMS   short/ambiguous words — only blocked as a WHOLE word
//                      (so "ass" blocks the name "ass" but not "Cassandra")
//   SUBSTRING_TERMS    longer, unambiguous profanity/slurs — blocked even
//                      hidden inside a name, with spaces/punctuation
//                      stripped and common leetspeak normalized first (so
//                      "b i t c h" and "b1tch" both get caught)
//
// This runs entirely client-side with no network call, so it works offline
// and never sends a kid's typed name anywhere. It's a reasonable first line
// of defense, not a substitute for moderation on anything shown beyond this
// device (e.g. a future shared/online leaderboard should re-check server-side).
//
// Extend either list below to tune what's blocked — nothing else needs to
// change.
// ============================================================================

const EXACT_WORD_TERMS = ['ass', 'butt', 'crap', 'damn', 'hell', 'sex', 'sexy', 'nazi', 'kill', 'die', 'dead'];

const SUBSTRING_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'pussy',
  'cock',
  'cunt',
  'whore',
  'slut',
  'fag',
  'nigg',
  'retard',
  'rape',
  'porn',
  'penis',
  'vagina',
  'boob',
  'hitler',
  'suicide',
];

function normalizeCollapsed(name) {
  return name
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z]/g, '');
}

/** True if `name` should be rejected as an offensive/inappropriate display name. */
export function isOffensiveName(name) {
  if (!name || typeof name !== 'string') return false;

  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => EXACT_WORD_TERMS.includes(w))) return true;

  const collapsed = normalizeCollapsed(name);
  if (!collapsed) return false;
  return SUBSTRING_TERMS.some((term) => collapsed.includes(term));
}
