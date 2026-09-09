// ============================================================================
// Scenario engine — objective tracking for the goal chosen at setup
// ----------------------------------------------------------------------------
// Every scenario (see gameConfig.js's SCENARIOS) still runs the exact same
// 24-month game with the exact same rules — this file just decides the
// starting weather (for Survive the Crash) and checks/announces objective
// progress at month-end (for Passive Income Race and Business Sprint).
// Classic Growth and Survive the Crash have no `objective`, so both no-op
// through checkScenarioObjective below.
// ============================================================================
import { WEATHER_STAGES, getScenario, DEFAULT_SCENARIO_ID } from '../data/gameConfig';
// Environment stream — the STARTING weather's duration is part of the
// shared Daily Challenge environment, same as every other weather roll
// (see weather.js / game/rng.js's module comment).
import { envRandomInt as randomInt } from './rng';
import { passiveIncome } from './players';

export { getScenario, DEFAULT_SCENARIO_ID };

/**
 * The starting weather state for a scenario, or null if it should just use
 * the normal default (see game/weather.js's createWeatherState — the first
 * stage in WEATHER_ORDER). A scenario that DOES override the start (Survive
 * the Crash) still rolls a normal random duration for that stage, exactly
 * like any other weather transition — it's only the STARTING stage that's
 * fixed, not how long it lasts.
 */
export function scenarioStartingWeather(scenario) {
  const stageId = scenario?.startingWeatherStageId;
  if (!stageId || !WEATHER_STAGES[stageId]) return null;
  const stage = WEATHER_STAGES[stageId];
  return { stageId, monthsInStage: 1, duration: randomInt(stage.minMonths, stage.maxMonths) };
}

/** The concrete passive-income dollar target for this scenario+difficulty,
 * or null if this scenario has no passive-income objective. */
export function passiveIncomeTarget(scenario, difficultyId) {
  if (scenario?.objective?.type !== 'passiveIncomeTarget') return null;
  const targets = scenario.objective.targetsByDifficulty;
  return targets[difficultyId] ?? targets.medium;
}

/**
 * Check every player's progress toward the scenario's objective, called
 * from turnEngine.js's resolveMonthEnd AFTER that month's income/badges
 * have already been applied. Non-mutating: returns { players, logEntries }
 * — a player who just crossed the goal for the first time gets
 * `scenarioGoalMonth` set (so this only ever fires once per player) and an
 * announcement log entry (kind: 'objectiveMet', which both the event log
 * and the bot-chat reaction system already know how to display/react to —
 * see chatEngine.js). `prices` and `weatherIncomeAmounts` are only needed
 * for the passiveIncomeTarget check (dynamic Tree House rent depends on
 * live price, and Lemonade Stand income on this month's roll — see
 * players.js).
 */
export function checkScenarioObjective(scenario, difficultyId, players, month, prices, weatherIncomeAmounts) {
  if (!scenario?.objective) return { players, logEntries: [] };
  const logEntries = [];

  if (scenario.objective.type === 'passiveIncomeTarget') {
    const target = passiveIncomeTarget(scenario, difficultyId);
    const nextPlayers = players.map((p) => {
      if (p.scenarioGoalMonth != null) return p;
      if (passiveIncome(p, { allPlayers: players, prices, month, weatherIncomeAmounts }) >= target) {
        logEntries.push({
          icon: '🏁',
          message: `${p.name} reached the Passive Income Race goal — $${target}/mo!`,
          kind: 'objectiveMet',
          playerId: p.id,
        });
        return { ...p, scenarioGoalMonth: month };
      }
      return p;
    });
    return { players: nextPlayers, logEntries };
  }

  if (scenario.objective.type === 'businessCountByMonth') {
    const { count, month: targetMonth } = scenario.objective;
    if (month !== targetMonth) return { players, logEntries };
    const nextPlayers = players.map((p) => {
      if (p.scenarioGoalMonth != null) return p;
      if (p.businesses.length >= count) {
        logEntries.push({
          icon: '🚀',
          message: `${p.name} hit the Business Sprint goal — ${count} businesses by month ${targetMonth}!`,
          kind: 'objectiveMet',
          playerId: p.id,
        });
        return { ...p, scenarioGoalMonth: month };
      }
      return p;
    });
    return { players: nextPlayers, logEntries };
  }

  return { players, logEntries };
}
