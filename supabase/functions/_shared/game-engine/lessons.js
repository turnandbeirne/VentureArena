// ============================================================================
// Financial-concept "why" layer
// ----------------------------------------------------------------------------
// VentureFlow already teaches real concepts through its mechanics
// (diversification, risk/reward, passive income...) but never says so out
// loud. This is a small, deliberately quiet layer that attaches a one-line,
// kid-friendly explanation of the real-world idea behind a moment in the
// game — the first time that moment happens, and never again this game (see
// state.seenLessons, threaded through by reducer.js's appendLog, the same
// single choke point every log entry already flows through for bot chat).
// ============================================================================
import { FINANCIAL_LESSONS } from '../data/gameConfig';

// Which concept (a key into FINANCIAL_LESSONS, gameConfig.js) a given log
// entry `kind` teaches, the FIRST time it happens in a game. Deliberately a
// small, curated set — not every kind needs a lesson, and piling on a lesson
// for every single event would turn a nice touch into noise.
const CONCEPT_BY_KIND = {
  business: 'passiveIncome',
  buy_treasure: 'riskReward',
  weather: 'marketCycles',
  fortuneBad: 'emergencyFund',
  fortuneGood: 'opportunity',
  skill: 'investInYourself',
  badge: 'goodHabits',
  businessUpgrade: 'reinvestment',
  businessExit: 'businessValuation',
};

// A badge earning entry is `kind: 'badge'` for every badge (see
// turnEngine.js), which normally teaches the generic "badges track good
// habits" lesson above. A badge that deserves a MORE specific concept gets
// looked up here first, by its own badgeId, falling back to the generic
// 'badge' -> 'goodHabits' mapping for every other badge.
const CONCEPT_BY_BADGE_ID = {
  balancedInvestor: 'diversification',
  cashedOut: 'businessValuation',
};

/**
 * Given the concept ids already shown this game and one newly-stamped log
 * entry, return `{ conceptId, lesson }` if this entry should teach a new
 * concept, or null if it doesn't (no matching kind, or that concept was
 * already shown this game). Pure — the caller (reducer.js) is responsible
 * for actually attaching the result and recording the conceptId as seen.
 */
export function maybeAttachLesson(seenLessons, entry) {
  const conceptId =
    (entry?.kind === 'badge' && CONCEPT_BY_BADGE_ID[entry.badgeId]) || CONCEPT_BY_KIND[entry?.kind];
  if (!conceptId) return null;
  if ((seenLessons || []).includes(conceptId)) return null;
  const lesson = FINANCIAL_LESSONS[conceptId];
  if (!lesson) return null;
  return { conceptId, lesson };
}
