import { useEffect, useState } from 'react';
import '../../vendor/game-ui/styles/game.css';
import { getDifficulty, ASSETS, GAME_ENDING_COUNTDOWN_SECONDS } from '../../vendor/data/gameConfig';
import { turnOrdinal, currentTurnTally } from '../../vendor/game-engine/turnClock';
import { totalUnitsOwned } from '../../vendor/game-engine/players';
import { playSound } from '../../vendor/game-ui/audio/soundEngine';
import { playMusicTrack } from '../../vendor/game-ui/audio/musicEngine';
import { useGameSounds } from '../../vendor/game-ui/hooks/useGameSounds';
import { useChatSounds } from '../../vendor/game-ui/hooks/useChatSounds';
import { usePlaySpeed } from '../../vendor/game-ui/hooks/usePlaySpeed';
import { useTeachMode } from '../../vendor/game-ui/hooks/useTeachMode';
import WeatherBadge from '../../vendor/game-ui/components/WeatherBadge';
import WeatherCard from '../../vendor/game-ui/components/WeatherCard';
import MonthProgress from '../../vendor/game-ui/components/MonthProgress';
import PlayerPanel from '../../vendor/game-ui/components/PlayerPanel';
import AssetShop from '../../vendor/game-ui/components/AssetShop';
import ActionBar from '../../vendor/game-ui/components/ActionBar';
import EventLog from '../../vendor/game-ui/components/EventLog';
import ChatPanel from '../../vendor/game-ui/components/ChatPanel';
import FortuneCardModal from '../../vendor/game-ui/components/FortuneCardModal';
import BusinessExitOfferModal from '../../vendor/game-ui/components/BusinessExitOfferModal';
import VolumeControl from '../../vendor/game-ui/components/VolumeControl';
import MusicControl from '../../vendor/game-ui/components/MusicControl';
import Brand from '../../vendor/game-ui/components/Brand';
import LeaderboardModal from '../../vendor/game-ui/components/LeaderboardModal';
import RulebookModal from '../../vendor/game-ui/components/RulebookModal';
import SpeedControl from '../../vendor/game-ui/components/SpeedControl';
import StartupLaunchModal from '../../vendor/game-ui/components/StartupLaunchModal';
import StartBusinessModal from '../../vendor/game-ui/components/StartBusinessModal';
import PlayerDetailModal from '../../vendor/game-ui/components/PlayerDetailModal';
import GameOverScreen from '../../vendor/game-ui/components/GameOverScreen';
import StatsHUD from '../../vendor/game-ui/components/StatsHUD';
import AssetHistoryModal from '../../vendor/game-ui/components/AssetHistoryModal';
import { useOnlineGame } from './useOnlineGame';

/**
 * The real VentureFlow board, ported into an Arena room — replaces the old
 * bare-bones pages/room/GameBoard.jsx (plain divs, no sound/animation/
 * weather-card/rulebook) with the same components the standalone game uses,
 * driven by useOnlineGame instead of useGame. Modeled directly on
 * VentureFlow's own src/components/GameBoard.jsx (see
 * vf-source-snapshot-2026-08-23.md) — same layout, same modal stack, same
 * turn banner — with these deliberate differences for a shared online table:
 *
 *  - No "New Game" button — a room's game starts once and is never
 *    restarted in place; "Leave Room" (onLeave, passed down from
 *    RoomScreen) takes its spot in the header.
 *  - No TurnTimer (VentureFlow's 30s chess clock isn't ported) — Arena has
 *    its own separate idle-timeout/AI-takeover system instead. A "Resign to
 *    AI" control is added so a human can hand off their own seat any time.
 *  - PlayerPanel/ChatPanel get `myPlayerId` so another human's card and the
 *    chat composer read/behave correctly for a real multi-viewer table
 *    (see those components' own comments).
 *  - The turn banner and "Your turn"/"X's turn" phrasing compare
 *    activePlayer.id to myPlayerId instead of VentureFlow's
 *    name.toLowerCase() === 'you' check, which only worked because
 *    solo/hotseat's default human name literally IS "You".
 *  - FortuneCardModal/BusinessExitOfferModal get `isMine` so only the
 *    entry's own owner sees live buttons; everyone else sees a waiting
 *    line. An AI-owned fortune-card entry has no human owner at all, so
 *    exactly one connected client (the lowest-seat-index human still
 *    seated — see isElectedClient below) auto-advances it, instead of
 *    every client racing to call ACK_FORTUNE_CARD.
 *  - StartupLaunchModal only ever renders for the launching player, and its
 *    dismissal is tracked locally (by businessId) rather than sent to the
 *    server — see useOnlineGame's ackStartupLaunch comment for why.
 *  - The final month's 'gameEnding' pause (a short countdown before the
 *    Game Over screen — see game-engine/turnEngine.js) auto-advances from
 *    EVERY connected client independently, not just the elected one: unlike
 *    ACK_FORTUNE_CARD, FINALIZE_GAME_OVER is a pure no-op past the first
 *    successful call, so there's no over-advancing risk to guard against.
 *  - "🗺️ View Game Board" on the Game Over screen flips a local
 *    showBoardAfterGameOver flag to show this same board read-only instead
 *    of early-returning GameOverScreen; "← Back to Recap" flips it back.
 */
export default function ArenaGameBoard({ room, gameState, mySeatIndex, session, onChanged, onLeave }) {
  const game = useOnlineGame({ roomId: room.id, onChanged });
  const {
    players,
    activePlayerIndex,
    weather,
    assetPrices,
    previousAssetPrices,
    month,
    totalMonths,
    log,
    chat,
    status,
    weatherIncomeAmounts,
  } = gameState;

  const difficulty = getDifficulty(gameState.difficultyId);
  const { speed } = usePlaySpeed();
  const { teachMode, toggle: toggleTeachMode } = useTeachMode();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showRulebook, setShowRulebook] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [dismissedLaunchId, setDismissedLaunchId] = useState(null);
  const [showStartBusiness, setShowStartBusiness] = useState(false);
  // "🗺️ View Game Board" on the Game Over screen flips this on to show the
  // final board (read-only) instead of the leaderboard/recap screen.
  const [showBoardAfterGameOver, setShowBoardAfterGameOver] = useState(false);
  // Live countdown shown during status 'gameEnding' — purely cosmetic, same
  // as standalone's GameBoard.jsx; the actual advance is driven by the
  // effect below (and mirrored by every other connected client's own copy
  // of this same effect).
  const [gameEndingSecondsLeft, setGameEndingSecondsLeft] = useState(GAME_ENDING_COUNTDOWN_SECONDS);

  const myPlayer = mySeatIndex != null ? players[mySeatIndex] : null;
  const myPlayerId = myPlayer?.id ?? null;

  const activePlayer = players[activePlayerIndex];
  const sameTurnBuys = currentTurnTally(activePlayer?.turnBuys, turnOrdinal(gameState));

  useGameSounds(log);
  useChatSounds(chat);

  useEffect(() => {
    playMusicTrack('background');
  }, []);

  const selectedPlayer = selectedPlayerId ? players.find((p) => p.id === selectedPlayerId) : null;
  const selectedAsset = selectedAssetId ? ASSETS.find((a) => a.id === selectedAssetId) : null;
  // True only while viewing the final board via "🗺️ View Game Board" — the
  // game itself is genuinely over at that point, so this is stricter than
  // just checking `status`.
  const readOnly = status === 'gameover' && showBoardAfterGameOver;
  const isMyTurn = !readOnly && status === 'playing' && activePlayer?.id === myPlayerId;
  const isAiTurn = !readOnly && status === 'playing' && activePlayer?.type === 'ai';

  const currentFortuneEntry = status === 'monthRecap' ? gameState.fortuneRecap[gameState.fortuneRecapIndex] : null;
  const currentFortunePlayer = currentFortuneEntry ? players.find((p) => p.id === currentFortuneEntry.playerId) : null;
  const pendingExitOffer = status === 'exitOffer' ? gameState.pendingExitOffer : null;
  const exitOfferPlayer = pendingExitOffer ? players.find((p) => p.id === pendingExitOffer.playerId) : null;

  // The lowest-seat-index human still seated — see this file's top comment.
  // Self-healing: if that player resigns (CONVERT_SEAT_TO_AI) or Arena's own
  // idle-timeout eventually converts their seat, `players.find` picks the
  // next human automatically on the very next replay.
  const electedHumanId = players.find((p) => p.type === 'human')?.id ?? null;
  const isElectedClient = myPlayerId != null && myPlayerId === electedHumanId;

  // Robots don't need a human to click past their own fortune-card recap —
  // exactly ONE connected client (the elected one) auto-advances it, so
  // every other client just watches the same card appear and disappear.
  // Keyed on primitives, not the entry/player OBJECTS: gameState is rebuilt
  // fresh by replayRoom() on every realtime event (any move, not just this
  // recap), so an object-identity dependency would restart this timer on
  // unrelated traffic and it might never fire.
  useEffect(() => {
    if (status !== 'monthRecap') return;
    if (!currentFortuneEntry) return;
    if (currentFortunePlayer?.type !== 'ai') return;
    if (!isElectedClient) return;
    const t = setTimeout(() => game.ackFortuneCard(), speed.recapAdvanceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, gameState.fortuneRecapIndex, currentFortuneEntry?.playerId, currentFortunePlayer?.type, isElectedClient, speed.recapAdvanceMs]);

  useEffect(() => {
    if (!game.error) return;
    const t = setTimeout(() => game.clearError(), 2400);
    return () => clearTimeout(t);
  }, [game.error, game.clearError]);

  // The final month's "that's a wrap" pause. Every connected client runs
  // this same effect independently and submits FINALIZE_GAME_OVER once its
  // own countdown reaches zero — see this file's top comment for why that's
  // safe without an elected-client rule (finalizeGameOver() is a no-op once
  // status is already 'gameover', so a race between clients just means the
  // first submission wins and the rest quietly no-op).
  useEffect(() => {
    if (status !== 'gameEnding') return;
    setGameEndingSecondsLeft(GAME_ENDING_COUNTDOWN_SECONDS);
    const tick = setInterval(() => {
      setGameEndingSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const advance = setTimeout(() => game.finalizeGameOver(), GAME_ENDING_COUNTDOWN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'gameover' && !showBoardAfterGameOver) {
    return (
      <GameOverScreen
        state={gameState}
        onPlayAgain={onLeave}
        onViewBoard={() => setShowBoardAfterGameOver(true)}
      />
    );
  }

  const pendingLaunch = gameState.pendingLaunch;
  const showLaunch =
    pendingLaunch && pendingLaunch.playerId === myPlayerId && pendingLaunch.businessId !== dismissedLaunchId;

  return (
    <div className="vf-page">
      <div className="vf-board-layout">
        <div className="vf-card vf-board">
          <StatsHUD
            player={myPlayer}
            prices={assetPrices}
            allPlayers={players}
            month={month}
            weatherIncomeAmounts={weatherIncomeAmounts}
            onOpenPortfolio={(playerId) => {
              setSelectedPlayerId(playerId);
            }}
          />

          <div className="vf-header">
            <Brand size="sm" align="left" />
            <div className="vf-header__right">
              <VolumeControl />
              <MusicControl />
              <SpeedControl />
              {myPlayer && (
                <button
                  type="button"
                  className="vf-btn vf-btn--sm vf-btn--ghost"
                  title="Hand your seat over to an AI player — you can't take it back"
                  disabled={game.busy}
                  onClick={() => {
                    playSound('click');
                    // eslint-disable-next-line no-alert
                    if (window.confirm(`Resign your seat to AI control, ${myPlayer.name}? You can't undo this.`)) {
                      game.convertSeatToAi();
                    }
                  }}
                >
                  🏳️ Resign to AI
                </button>
              )}
              <button
                type="button"
                className={`vf-btn vf-btn--sm ${teachMode ? 'vf-btn--go' : 'vf-btn--ghost'}`}
                title={teachMode ? 'Teach Me mode is ON — tap Teach Me to hide the ❓ lesson tips' : 'Turn on Teach Me mode for ❓ lesson tips on cards, weather, and more'}
                onClick={() => {
                  playSound('click');
                  toggleTeachMode();
                }}
              >
                🎓 Teach Me
              </button>
              <button
                type="button"
                className="vf-btn vf-btn--sm vf-btn--ghost"
                title="Leaderboard"
                onClick={() => {
                  playSound('click');
                  setShowLeaderboard(true);
                }}
              >
                🏆
              </button>
              <button
                type="button"
                className="vf-btn vf-btn--sm vf-btn--ghost"
                title="Rulebook — how everything works"
                onClick={() => {
                  playSound('click');
                  setShowRulebook(true);
                }}
              >
                📖
              </button>
              <span className="vf-pill" title={difficulty.tagline}>
                {difficulty.icon} {difficulty.name}
              </span>
              <WeatherBadge weather={weather} />
              {readOnly && (
                <button
                  type="button"
                  className="vf-btn vf-btn--sm vf-btn--ghost"
                  onClick={() => {
                    playSound('click');
                    setShowBoardAfterGameOver(false);
                  }}
                >
                  ← Back to Recap
                </button>
              )}
              <button
                type="button"
                className="vf-btn vf-btn--sm vf-btn--ghost"
                onClick={() => {
                  playSound('click');
                  onLeave();
                }}
              >
                ← Lobby
              </button>
            </div>
          </div>

          <MonthProgress month={month} totalMonths={totalMonths} />

          <PlayerPanel
            players={players}
            prices={assetPrices}
            month={month}
            weatherIncomeAmounts={weatherIncomeAmounts}
            activePlayerIndex={activePlayerIndex}
            spotlightMs={speed.spotlightMs}
            myPlayerId={myPlayerId ?? undefined}
            onSelectPlayer={(playerId) => {
              playSound('click');
              setSelectedPlayerId(playerId);
            }}
          />

          <div className={`vf-turn-banner ${isMyTurn ? '' : 'vf-turn-banner--ai'}`}>
            <span className="vf-turn-banner__text">
              {readOnly
                ? "🏁 Final game board — here's how everything ended up"
                : status === 'gameEnding'
                ? "🏁 That's the final month wrapped up — tallying the results..."
                : status === 'exitOffer'
                ? `💼 ${exitOfferPlayer?.name || 'Someone'} has a buyout offer to decide on...`
                : status === 'monthRecap'
                ? "📬 Reading this month's fortune cards..."
                : isMyTurn
                ? `${activePlayer.avatar} Your turn — what will you do?`
                : isAiTurn
                ? `🤖 ${activePlayer?.name} is thinking...`
                : `⏳ Waiting for ${activePlayer?.avatar || ''} ${activePlayer?.name}...`}
            </span>
            {isMyTurn && (
              <button
                type="button"
                className="vf-btn vf-btn--primary vf-btn--sm vf-turn-banner__end-btn"
                disabled={game.busy}
                onClick={() => game.endTurn(activePlayer.id)}
              >
                Done! Roll the weather 🎲
              </button>
            )}
          </div>

          <AssetShop
            prices={assetPrices}
            previousPrices={previousAssetPrices}
            player={activePlayer}
            allPlayers={players}
            weather={weather}
            weatherIncomeAmounts={weatherIncomeAmounts}
            sameTurnBuys={sameTurnBuys}
            disabled={!isMyTurn || game.busy}
            onBuy={(assetId) => game.buyAsset(activePlayer.id, assetId, 1)}
            onSell={(assetId) => game.sellAsset(activePlayer.id, assetId, 1)}
            onViewHistory={(assetId) => setSelectedAssetId(assetId)}
          />

          <ActionBar
            player={activePlayer}
            disabled={!isMyTurn || game.busy}
            onStartBusiness={() => setShowStartBusiness(true)}
            onLearnSkill={() => game.learnSkill(activePlayer.id)}
            onDone={() => game.endTurn(activePlayer.id)}
          />
        </div>

        <div className="vf-board-sidebar">
          <WeatherCard weather={weather} weatherIncomeAmounts={weatherIncomeAmounts} weatherSeverityId={gameState.weatherSeverityId} />
          <EventLog log={log} />
          <ChatPanel chat={chat} players={players} onSendChat={game.sendChat} myPlayerId={myPlayerId ?? undefined} />
        </div>
      </div>

      {currentFortuneEntry && (
        <FortuneCardModal
          entry={currentFortuneEntry}
          onContinue={game.ackFortuneCard}
          isMine={currentFortunePlayer?.type === 'human' ? currentFortunePlayer.id === myPlayerId : undefined}
        />
      )}

      {pendingExitOffer && (
        <BusinessExitOfferModal
          offer={pendingExitOffer}
          playerName={exitOfferPlayer?.name}
          playerAvatar={exitOfferPlayer?.avatar}
          onDecide={(accept) => game.resolveExitOffer(pendingExitOffer.playerId, accept)}
          isMine={pendingExitOffer.playerId === myPlayerId}
        />
      )}

      <LeaderboardModal open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      <RulebookModal
        open={showRulebook}
        difficultyId={gameState.difficultyId}
        scenarioId={gameState.scenarioId}
        weatherSeverityId={gameState.weatherSeverityId}
        turnTimer={false}
        onClose={() => setShowRulebook(false)}
      />

      {showLaunch && (
        <StartupLaunchModal launch={pendingLaunch} onContinue={() => setDismissedLaunchId(pendingLaunch.businessId)} />
      )}

      {/* Naming step, opened by ActionBar's Start Business button above —
          confirming here is what actually submits START_BUSINESS; the
          launch celebration modal above then picks up from the resulting
          state.pendingLaunch, same flow as VentureFlow's own GameBoard.jsx. */}
      {showStartBusiness && myPlayer && (
        <StartBusinessModal
          existingNames={myPlayer.businesses.map((b) => b.name)}
          onConfirm={(name) => {
            game.startBusiness(myPlayer.id, name);
            setShowStartBusiness(false);
          }}
          onCancel={() => setShowStartBusiness(false)}
        />
      )}

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          prices={assetPrices}
          allPlayers={players}
          month={month}
          weather={weather}
          weatherIncomeAmounts={weatherIncomeAmounts}
          canUpgrade={isMyTurn && selectedPlayer.id === myPlayerId}
          onUpgradeBusiness={(playerId, businessId, trackId) => game.upgradeBusiness(playerId, businessId, trackId)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}

      {selectedAsset && (
        <AssetHistoryModal
          asset={selectedAsset}
          history={gameState.assetHistory?.[selectedAsset.id]}
          currentMonth={month}
          currentPrice={assetPrices[selectedAsset.id]}
          totalOwned={totalUnitsOwned(players, selectedAsset.id)}
          weatherIncomeAmounts={weatherIncomeAmounts}
          onClose={() => setSelectedAssetId(null)}
        />
      )}

      {/* The pause between the final month's fortune-card recap and the
          actual Game Over screen — see game-engine/turnEngine.js's
          acknowledgeFortuneCard and this file's own gameEnding effect above.
          Not dismissable by clicking outside — this is a beat to let, not a
          decision to make. */}
      {status === 'gameEnding' && (
        <div className="vf-modal-overlay">
          <div className="vf-card vf-gameending">
            <div className="vf-gameending__icon">🏁</div>
            <h2>That's a wrap!</h2>
            <p className="vf-gameending__hint">The final month is done — tallying up the results...</p>
            <div className="vf-gameending__countdown">{gameEndingSecondsLeft}</div>
            <button type="button" className="vf-btn vf-btn--go" onClick={() => game.finalizeGameOver()}>
              See Final Results Now
            </button>
          </div>
        </div>
      )}

      {game.error && <div className="vf-toast">{game.error}</div>}
    </div>
  );
}
