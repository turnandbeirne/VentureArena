// ============================================================================
// New-game factory
// ============================================================================
import { GAME_LENGTH_MONTHS, getDifficulty, DEFAULT_DIFFICULTY_ID } from '../data/gameConfig';
import { createPlayerRoster, rollMonthlyIncomeAmounts } from './players';
import { createInitialPrices } from './market';
import { createWeatherState } from './weather';
import { getScenario, DEFAULT_SCENARIO_ID, scenarioStartingWeather } from './scenarios';

export function createNewGame(
  mode,
  humanNames = [],
  difficultyId = DEFAULT_DIFFICULTY_ID,
  botConfigs = [],
  scenarioId = DEFAULT_SCENARIO_ID,
  humanAvatars = []
) {
  const difficulty = getDifficulty(difficultyId);
  const scenario = getScenario(scenarioId);
  // Most scenarios use the normal opening weather (see weather.js's
  // createWeatherState); Survive the Crash overrides it to start mid-storm
  // instead — see game/scenarios.js.
  const weather = scenarioStartingWeather(scenario) || createWeatherState();
  return {
    status: 'playing', // 'playing' | 'monthRecap' | 'gameover'
    mode,
    difficultyId: difficulty.id,
    scenarioId: scenario.id,
    monthlyAllowance: difficulty.monthlyAllowance,
    month: 1,
    totalMonths: GAME_LENGTH_MONTHS,
    weather,
    // This period's rolled per-unit income — the weather-driven amount for
    // Lemonade Stand and the Piggy Bank's interest rate — for month 1, so
    // both are available before the first payday ever happens. See
    // players.js's rollMonthlyIncomeAmounts and turnEngine.js, which
    // rerolls this every month-end after.
    weatherIncomeAmounts: rollMonthlyIncomeAmounts(weather),
    assetPrices: createInitialPrices(),
    previousAssetPrices: createInitialPrices(),
    players: createPlayerRoster(mode, humanNames, difficulty, botConfigs, humanAvatars),
    activePlayerIndex: 0,
    log: [],
    chat: [], // bot personality chat feed — see game/chatEngine.js
    fortuneRecap: [],
    fortuneRecapIndex: 0,
    winnerId: null,
    // Set by the reducer when a HUMAN player starts a business, cleared
    // when they dismiss the celebration — see reducer.js's START_BUSINESS /
    // ACK_STARTUP_LAUNCH and components/StartupLaunchModal.jsx.
    pendingLaunch: null,
    // Bookkeeping for the stepped robot turn (reducer.js's RUN_AI_STEP):
    // how many moves the current robot has taken and whether it's finished.
    // Reset on every hand-off; never read for a human's turn.
    aiTurnSteps: 0,
    aiTurnDone: false,
    seenLessons: [], // concept ids already shown this game — see game/lessons.js
  };
}
