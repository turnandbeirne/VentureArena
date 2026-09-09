// ============================================================================
// New-game factory
// ============================================================================
import {
  GAME_LENGTH_MONTHS,
  getDifficulty,
  DEFAULT_DIFFICULTY_ID,
  TURN_TIME_SECONDS,
  getWeatherSeverity,
} from '../data/gameConfig';
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
  humanAvatars = [],
  options = {}
) {
  const difficulty = getDifficulty(difficultyId);
  const severity = getWeatherSeverity(options.weatherSeverityId);
  const scenario = getScenario(scenarioId);
  // Most scenarios use the normal opening weather (see weather.js's
  // createWeatherState); Survive the Crash overrides it to start mid-storm
  // instead — see game/scenarios.js.
  const weather = scenarioStartingWeather(scenario) || createWeatherState();
  return {
    status: 'playing', // 'playing' | 'monthRecap' | 'exitOffer' | 'gameEnding' | 'gameover'
    mode,
    difficultyId: difficulty.id,
    // How hard the economy swings this game — see gameConfig.js's
    // WEATHER_SEVERITIES. In state rather than a device preference: every
    // seat shares one economy.
    weatherSeverityId: severity.id,
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
    weatherIncomeAmounts: rollMonthlyIncomeAmounts(weather, severity.id),
    assetPrices: createInitialPrices(),
    previousAssetPrices: createInitialPrices(),
    players: createPlayerRoster(mode, humanNames, difficulty, botConfigs, humanAvatars),
    activePlayerIndex: 0,
    log: [],
    chat: [], // bot personality chat feed — see game/chatEngine.js
    fortuneRecap: [],
    fortuneRecapIndex: 0,
    // Set true by finishMonthEnd on the FINAL month, then cleared by
    // acknowledgeFortuneCard once the last fortune card is dismissed — see
    // turnEngine.js for the full 'monthRecap' -> 'gameEnding' -> 'gameover'
    // sequencing this drives.
    pendingGameOver: false,
    // Per-asset price/cashflow history, one snapshot per completed month —
    // see turnEngine.js's finishMonthEnd and components/AssetHistoryModal.jsx.
    assetHistory: {},
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
    // Turn timer — chosen at setup and stored HERE rather than in a device
    // preference (unlike play speed), because every seat at the table has
    // to be playing by the same rule and it must survive a reload mid-game.
    // `turnDeadlineAt` is a wall-clock ms timestamp, set by the UI when a
    // human turn begins; null whenever no clock is running.
    turnTimer: options.turnTimer ? { seconds: TURN_TIME_SECONDS } : null,
    turnDeadlineAt: null,
    seenLessons: [], // concept ids already shown this game — see game/lessons.js
  };
}
