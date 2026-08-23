// ============================================================================
// AI robot player logic
// ----------------------------------------------------------------------------
// A tunable greedy strategy: robots read the current weather mood and
// repeatedly take the single best-scoring affordable action until nothing
// beneficial is left (or a safety cap is hit). In good weather they lean
// into growth (businesses, then risky/bouncy assets); in bad weather they
// retreat — selling off risky holdings and parking cash in Piggy Bank.
//
// On top of that base behavior, every robot has a `strategyId` (from its
// BOT_PERSONALITIES entry, see gameConfig.js) and a `skillLevelId` — set at
// setup, either picked directly or rolled randomly — that reshape *how* it
// plays:
//   - strategyId picks a STRATEGIES entry below: a set of score multipliers
//     per move "kind" (plus a couple of behavior flags) that make e.g.
//     DaddyBigBux chase businesses, MrGrinch hoard cash, or GrumpyMommy play
//     the weather backwards on purpose.
//   - skillLevelId picks a SKILL_PROFILES entry: how much cash it's willing
//     to leave idle, how many moves it takes in a turn, and how often it
//     second-guesses its own best-scoring move (a "mistake" — picks a
//     random affordable move instead of the top one).
//
// Both ids are read straight off the player object rather than looked up
// live against BOT_PERSONALITIES, and fall back to 'balanced'/'sharp' if
// missing entirely — so games saved before this feature existed (whose AI
// players have neither field) keep playing exactly as they did before.
//
// Reuses the exact same action functions humans use (actions.js), so the
// robots can never break a rule a human couldn't also break.
// ============================================================================
import { buyAsset, sellAsset, startBusiness, learnSkill, upgradeBusiness } from './actions';
import { BUSINESS_COST, BUSINESS_SKILL_COST, SKILL_COST } from '../data/gameConfig';
import { getStageInfo } from './weather';
import { chance, randomInt } from './rng';
import { upgradeCost, canUpgradeTrack } from './businessUpgrades';

// The four upgrade tracks a bot can reinvest in, in the order a candidate
// list checks them — see buildBusinessUpgradeCandidates below. Kept as its
// own list (rather than reading BUSINESS_UPGRADE_TRACKS's key order
// directly) so it's obvious at a glance which "kind" string maps to which
// track for the STRATEGIES weight tables just below.
const UPGRADE_TRACK_IDS = ['marketing', 'sales', 'ops', 'rnd'];

const GOOD_MOODS = new Set(['boom', 'peak', 'rebound']);

const DEFAULT_STRATEGY_ID = 'balanced';
const DEFAULT_SKILL_ID = 'sharp';

// Per-move-"kind" score multipliers. Any kind not listed for a strategy
// defaults to 1 (unchanged from the base greedy behavior). Two behavior
// flags on top of the weights:
//   - ignoreWeatherRisk: always builds the "growth" candidate set, storms
//     or not — a reckless bot that never sees a reason to retreat.
//   - contrarian: flips which candidate set gets built — plays "growth"
//     moves during storms and "retreat" moves during booms.
// Per-strategy weights for reinvesting in an already-owned business — see
// buildBusinessUpgradeCandidates below, kind strings 'upgradeMarketing' /
// 'upgradeSales' / 'upgradeOps' / 'upgradeRnd'. Every personality gets SOME
// weight here (nobody is hard-coded to literally never reinvest) but they
// lean into it very differently: tycoon (chasing businesses) reinvests
// aggressively across the board; hoarder (cash above all) barely touches
// it, especially the slow/risky R&D track; saver leans hardest into
// Operations (efficiency = future savings, right in its wheelhouse);
// reckless likes the flashy short-term Marketing bump and the swingy R&D
// gamble but shrugs off patient Sales growth; flipper (in-and-out) prefers
// the short-lived Marketing boost over anything permanent.
const STRATEGIES = {
  balanced: {
    // MrB — the original, unweighted greedy behavior.
    weights: {},
  },
  reckless: {
    // Leeroy Jenkins — charges into risky/flashy plays and ignores storms.
    ignoreWeatherRisk: true,
    weights: {
      business: 1.2,
      treasure: 1.5,
      lemonade: 1.3,
      treehouse: 0.9,
      skill: 0.5,
      piggy: 0.1,
      upgradeMarketing: 1.3,
      upgradeSales: 0.8,
      upgradeOps: 0.6,
      upgradeRnd: 1.3,
    },
  },
  flipper: {
    // BossEmby — chases the bouncy assets both in and out, skips slow ones.
    weights: {
      business: 0.6,
      treasure: 1.4,
      lemonade: 1.4,
      treehouse: 0.7,
      skill: 0.8,
      piggy: 0.3,
      sellTreasure: 1.3,
      sellLemonade: 1.3,
      upgradeMarketing: 1.1,
      upgradeSales: 0.6,
      upgradeOps: 0.6,
      upgradeRnd: 0.8,
    },
  },
  hoarder: {
    // MrGrinch — every dollar saved is a dollar loved. Cash and rent over
    // anything risky, sells off risk fast in a storm.
    weights: {
      business: 0.5,
      treasure: 0.4,
      lemonade: 0.5,
      treehouse: 1.1,
      skill: 0.6,
      piggy: 2.5,
      sellTreasure: 1.1,
      sellLemonade: 1.1,
      upgradeMarketing: 0.3,
      upgradeSales: 0.5,
      upgradeOps: 0.7,
      upgradeRnd: 0.2,
    },
  },
  tycoon: {
    // DaddyBigBux — businesses, businesses, and more businesses. The one
    // personality that treats reinvesting as just as core as starting new
    // ones in the first place — every upgrade track scores above 1.
    weights: {
      business: 2.2,
      skill: 1.6,
      treasure: 0.6,
      lemonade: 0.6,
      treehouse: 0.8,
      piggy: 0.3,
      upgradeMarketing: 1.4,
      upgradeSales: 1.8,
      upgradeOps: 1.3,
      upgradeRnd: 1.6,
    },
  },
  saver: {
    // MoneyMama — smart, patient, and always prepared, but not stingy.
    weights: {
      piggy: 1.6,
      treehouse: 1.3,
      skill: 1.1,
      treasure: 0.7,
      lemonade: 0.7,
      business: 0.9,
      upgradeMarketing: 0.6,
      upgradeSales: 1.0,
      upgradeOps: 1.5,
      upgradeRnd: 0.7,
    },
  },
  contrarian: {
    // GrumpyMommy — buys the dip, sells the hype. Always keeps a rainy-day
    // fund on hand regardless of which way the market's going.
    contrarian: true,
    weights: { piggy: 1.2, business: 0.9, upgradeMarketing: 0.8, upgradeSales: 0.9, upgradeOps: 0.9, upgradeRnd: 0.8 },
  },
};

function getStrategy(strategyId) {
  return STRATEGIES[strategyId] || STRATEGIES[DEFAULT_STRATEGY_ID];
}

// How efficiently/thoughtfully a bot plays, independent of its strategy.
//   - cashBuffer: how much cash it always leaves untouched (higher = more
//     conservative/wasteful with idle cash).
//   - maxSteps: how many moves it's willing to take in a single turn.
//   - mistakeChance: odds that, instead of its best-scoring move, it plays
//     a random affordable one — simulating a less-sharp player who doesn't
//     always spot the optimal play.
const SKILL_PROFILES = {
  rookie: { cashBuffer: 45, maxSteps: 10, mistakeChance: 0.35 },
  sharp: { cashBuffer: 20, maxSteps: 25, mistakeChance: 0.08 },
  shark: { cashBuffer: 8, maxSteps: 32, mistakeChance: 0 },
};

function getSkillProfile(skillLevelId) {
  return SKILL_PROFILES[skillLevelId] || SKILL_PROFILES[DEFAULT_SKILL_ID];
}

function isGoodWeather(weatherState) {
  return GOOD_MOODS.has(getStageInfo(weatherState).mood);
}

function findPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId);
}

function weighted(strategy, kind, score) {
  const multiplier = strategy.weights[kind] ?? 1;
  return { score: score * multiplier, kind };
}

// Base (pre-strategy-weight) scores for reinvesting in an owned business,
// per track, per weather mood. Deliberately below 'business' (100/15) in
// both moods — a bot still prioritizes STARTING a new business over
// upgrading one it already has, then reinvests with whatever it's got left
// over, the same "grow what you already started" order a human player
// would naturally lean toward. Storm-mode scores are much lower across the
// board (cash preservation matters more than growing a business further
// mid-downturn) but never zero, so a saver/hoarder bot can still slip in a
// cheap Operations purchase between defensive moves if nothing else is
// worth doing.
const UPGRADE_BASE_SCORES_GOOD = { marketing: 55, sales: 85, ops: 50, rnd: 75 };
const UPGRADE_BASE_SCORES_STORM = { marketing: 10, sales: 20, ops: 15, rnd: 8 };
const UPGRADE_KIND_BY_TRACK = { marketing: 'upgradeMarketing', sales: 'upgradeSales', ops: 'upgradeOps', rnd: 'upgradeRnd' };

/**
 * One candidate per (owned business × still-upgradeable, affordable track)
 * — see game/businessUpgrades.js's canUpgradeTrack/upgradeCost for the
 * exact affordability/cap rules, reused as-is so a bot can never buy an
 * upgrade a human couldn't also buy. Reuses actions.js's upgradeBusiness()
 * the same way every other candidate here reuses a human action function.
 */
function buildUpgradeCandidates(player, strategy, cashBuffer, baseScores, month) {
  const candidates = [];
  for (const business of player.businesses) {
    for (const trackId of UPGRADE_TRACK_IDS) {
      // `month` is passed through so a robot gets the same monthly upkeep
      // campaign a human does — otherwise a bot's fully-built business
      // would be the only thing at the table that can't be kept tended.
      if (!canUpgradeTrack(business, trackId, month)) continue;
      const cost = upgradeCost(business, trackId);
      if (player.cash - cashBuffer < cost) continue;
      candidates.push({
        ...weighted(strategy, UPGRADE_KIND_BY_TRACK[trackId], baseScores[trackId]),
        run: (s) => upgradeBusiness(s, player.id, business.id, trackId),
      });
    }
  }
  return candidates;
}

function buildCandidates(state, playerId, strategy, cashBuffer) {
  const player = findPlayer(state, playerId);
  const prices = state.assetPrices;
  const actuallyGood = isGoodWeather(state.weather);
  const good = strategy.ignoreWeatherRisk ? true : strategy.contrarian ? !actuallyGood : actuallyGood;
  const candidates = [];

  if (good) {
    if (player.cash >= BUSINESS_COST && player.skillTokens >= BUSINESS_SKILL_COST) {
      candidates.push({ ...weighted(strategy, 'business', 100), run: (s) => startBusiness(s, playerId) });
    }
    if (player.cash - cashBuffer >= prices.treasure) {
      candidates.push({ ...weighted(strategy, 'treasure', 70), run: (s) => buyAsset(s, playerId, 'treasure', 1) });
    }
    if (player.cash - cashBuffer >= prices.lemonade) {
      candidates.push({ ...weighted(strategy, 'lemonade', 65), run: (s) => buyAsset(s, playerId, 'lemonade', 1) });
    }
    if (player.cash - cashBuffer >= prices.treehouse) {
      candidates.push({ ...weighted(strategy, 'treehouse', 55), run: (s) => buyAsset(s, playerId, 'treehouse', 1) });
    }
    if (player.cash >= SKILL_COST && player.skillTokens < 3) {
      candidates.push({ ...weighted(strategy, 'skill', 45), run: (s) => learnSkill(s, playerId) });
    }
    if (player.cash - cashBuffer >= prices.piggy) {
      candidates.push({ ...weighted(strategy, 'piggy', 20), run: (s) => buyAsset(s, playerId, 'piggy', 1) });
    }
    candidates.push(...buildUpgradeCandidates(player, strategy, cashBuffer, UPGRADE_BASE_SCORES_GOOD, state.month));
  } else {
    // Storms / dips: retreat to safety first.
    if ((player.holdings.treasure || 0) > 0) {
      candidates.push({ ...weighted(strategy, 'sellTreasure', 95), run: (s) => sellAsset(s, playerId, 'treasure', 1) });
    }
    if ((player.holdings.lemonade || 0) > 0) {
      candidates.push({ ...weighted(strategy, 'sellLemonade', 85), run: (s) => sellAsset(s, playerId, 'lemonade', 1) });
    }
    if (player.cash - cashBuffer >= prices.piggy) {
      candidates.push({ ...weighted(strategy, 'piggy', 60), run: (s) => buyAsset(s, playerId, 'piggy', 1) });
    }
    if (player.cash >= BUSINESS_COST && player.skillTokens >= BUSINESS_SKILL_COST) {
      candidates.push({ ...weighted(strategy, 'business', 15), run: (s) => startBusiness(s, playerId) });
    }
    if (player.cash >= SKILL_COST && player.skillTokens < 2) {
      candidates.push({ ...weighted(strategy, 'skill', 10), run: (s) => learnSkill(s, playerId) });
    }
    candidates.push(...buildUpgradeCandidates(player, strategy, cashBuffer, UPGRADE_BASE_SCORES_STORM, state.month));
  }

  return candidates;
}

/**
 * Pick which candidate to play: normally the best-scoring one, but a bot
 * below "shark" sharpness occasionally (per its mistakeChance) plays a
 * random affordable move instead — a human-like slip-up rather than a
 * hard-coded "always optimal" AI.
 */
function chooseMove(candidates, skill) {
  candidates.sort((a, b) => b.score - a.score);
  // Routed through game/rng.js (rather than a raw Math.random()) so a
  // robot's "mistakes" are part of the same seedable sequence as
  // everything else in the engine — see rng.js's header comment for why
  // that matters for Daily Challenge mode.
  if (candidates.length > 1 && chance(skill.mistakeChance)) {
    return candidates[randomInt(0, candidates.length - 1)];
  }
  return candidates[0];
}

/**
 * How many moves this robot is still willing to make this turn — its skill
 * profile's cap, which the stepped path below has to know about too (see
 * runAiStep). Exported so game/reducer.js can ask without reaching into
 * SKILL_PROFILES itself.
 */
export function aiMaxSteps(player) {
  return getSkillProfile(player?.skillLevelId).maxSteps;
}

/**
 * Take exactly ONE robot action and return, rather than playing the whole
 * turn out in a single call the way runAiTurn does below.
 *
 * This is what lets the game be *watchable*: driven one step at a time from
 * game/reducer.js's RUN_AI_STEP (paced by hooks/useGame.js against the
 * player's chosen speed — see game/playSpeed.js), each decision lands on its
 * own beat, with its own log line and its own sound, instead of four moves
 * and four log lines appearing in the same frame. A player can actually see
 * that the bot bought a Tree House *because* the weather turned sunny.
 *
 * Returns `{ state, logEntry, acted }` — `acted: false` means the robot has
 * nothing left worth doing (no affordable candidate, or the action it chose
 * unexpectedly failed) and its turn should end. Identical decision logic to
 * runAiTurn: same candidate builder, same strategy weighting, same
 * mistake-chance roll. The ONLY difference is where the loop lives.
 */
export function runAiStep(state, playerId) {
  const player = findPlayer(state, playerId);
  const strategy = getStrategy(player?.strategyId);
  const skill = getSkillProfile(player?.skillLevelId);

  const candidates = buildCandidates(state, playerId, strategy, skill.cashBuffer);
  if (candidates.length === 0) return { state, logEntry: null, acted: false };

  const chosen = chooseMove(candidates, skill);
  const result = chosen.run(state);
  // Shouldn't happen given the affordability checks in buildCandidates, but
  // a failed action must end the turn rather than spin: the same state would
  // produce the same choice again next step, forever.
  if (!result.ok) return { state, logEntry: null, acted: false };

  return { state: result.state, logEntry: result.logEntry || null, acted: true };
}

/**
 * Run a full AI turn: greedily apply the best-scoring (strategy-weighted)
 * action, over and over, until nothing affordable/beneficial remains or the
 * bot's skill-level step cap is hit. Returns the updated game state plus a
 * list of log entries describing what happened.
 *
 * Still used verbatim by the server-side replay in the VentureMaker Arena
 * (which has no UI to pace and wants a whole turn resolved in one call), and
 * by tests. Interactive play goes through runAiStep above instead.
 */
export function runAiTurn(state, playerId) {
  const player = findPlayer(state, playerId);
  const strategy = getStrategy(player?.strategyId);
  const skill = getSkillProfile(player?.skillLevelId);

  let currentState = state;
  const logEntries = [];

  for (let step = 0; step < skill.maxSteps; step++) {
    const candidates = buildCandidates(currentState, playerId, strategy, skill.cashBuffer);
    if (candidates.length === 0) break;

    const chosen = chooseMove(candidates, skill);
    const result = chosen.run(currentState);
    if (!result.ok) break; // shouldn't happen given our affordability checks, but stay safe

    currentState = result.state;
    if (result.logEntry) logEntries.push(result.logEntry);
  }

  return { state: currentState, logEntries };
}
