import { useEffect, useRef, useState } from 'react';
import '../styles/game.css';
import { LEADERBOARD_TOP_HIGHLIGHT, getScenario } from '../../data/gameConfig';
import { netWorth, passiveIncome, snapshotPortfolio } from '../../game-engine/players';
import { buildDailyChallengeShareText } from '../../game-engine/dailyChallenge';
import { isOffensiveName } from '../../game-engine/nameFilter';
import { playSound } from '../audio/soundEngine';
import { playMusicTrack } from '../audio/musicEngine';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useGlobalLeaderboard } from '../hooks/useGlobalLeaderboard';
import { buildInsights } from '../game/insights';
import { downloadTextFile, slugForFilename } from '../game/downloadFile';
import { buildScoreReport, buildLedgerReport, buildPlayByPlayReport } from '../game/gameRecord';
import { buildRecapShareUrl } from '../game/recapShare';
import VolumeControl from './VolumeControl';
import MusicControl from './MusicControl';
import Brand from './Brand';
import VentureMakerLink from './VentureMakerLink';
import LeaderboardModal from './LeaderboardModal';
import Fireworks from './Fireworks';
import { ChatEntryRow } from './ChatPanel';
import NetWorthChart from './NetWorthChart';
import FamilyRecapModal from './FamilyRecapModal';
import PlayerDetailModal from './PlayerDetailModal';
import WealthPile from './WealthPile';

// Same Supabase project this room's own moves already run through (see
// lib/supabaseClient.js) — a public, unauthenticated Edge Function
// (send-recap-email) that sends the actual email via Resend. Plain fetch
// rather than the supabase-js client already imported elsewhere in Arena:
// this function is deliberately public (no session needed), and a plain
// fetch keeps that obvious at the call site.
const RECAP_EMAIL_ENDPOINT = 'https://iwpysmrmunirsvdrecmw.supabase.co/functions/v1/send-recap-email';

export default function GameOverScreen({ state, onPlayAgain, onRecordProfileResult, onViewBoard }) {
  const { players, assetPrices, winnerId, mode, difficultyId, scenarioId, dailyChallengeDate, month } = state;
  const ranked = [...players].sort((a, b) => netWorth(b, assetPrices) - netWorth(a, assetPrices));
  const winner = players.find((p) => p.id === winnerId) || ranked[0];
  const scenario = getScenario(scenarioId);

  // The robots' closing thoughts — gloating if one of them won, applauding
  // whoever did (see game/chatEngine.js's 'gameover' reaction). Naturally
  // the most recent chat entries, since they're generated the instant the
  // game ends.
  const closingChat = (state.chat || []).filter((c) => c.category === 'gloat' || c.category === 'applause').slice(-4);

  const { addEntry } = useLeaderboard();
  // `enabled: false` — this hook is only here to SUBMIT. Fetching the board
  // on the game-over screen would be a network round-trip nobody asked for.
  const globalBoard = useGlobalLeaderboard({ enabled: false });
  const [globalStatus, setGlobalStatus] = useState(null); // null | 'saving' | 'saved' | 'failed'
  const [scoreName, setScoreName] = useState(winner.name);
  const [scoreEmail, setScoreEmail] = useState('');
  const [nameError, setNameError] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState(null);
  const [savedRank, setSavedRank] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [recapLinkCopied, setRecapLinkCopied] = useState(false);
  const [recapEmail, setRecapEmail] = useState('');
  // idle | sending | sent | error — separate from scoreEmail/globalStatus
  // above: this is a DIFFERENT address (whoever should receive the recap,
  // not necessarily the player saving their score) and a different action
  // entirely (an email actually gets sent, vs. scoreEmail which is
  // documented as "kept private, never sent anywhere").
  const [recapEmailStatus, setRecapEmailStatus] = useState('idle');
  const [recapEmailError, setRecapEmailError] = useState('');
  const [unlockCelebration, setUnlockCelebration] = useState(null);
  // Which standings row (if any) has its full portfolio breakdown open —
  // read-only here (game's over, nothing left to upgrade), but this is
  // exactly what makes it possible to see at a glance how much a specific
  // holding (lemonade's price swings, a business's upgrades, etc.) actually
  // contributed, instead of only ever seeing the final net-worth total.
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const selectedPlayer = selectedPlayerId ? players.find((p) => p.id === selectedPlayerId) : null;

  const insights = buildInsights(winner, assetPrices);

  // Whichever human player did best this game "counts" toward the lifetime
  // profile (see game/profile.js) — the natural choice in solo mode (only
  // one human); in hot-seat, the best-performing human of the table. Fires
  // exactly once, when this screen first shows for a finished game. The
  // recordedRef guard (rather than relying on the empty dep array alone)
  // is what actually makes that true: React 18 StrictMode intentionally
  // double-invokes mount effects in development to surface exactly this
  // kind of non-idempotent side effect, which would otherwise double-count
  // gamesPlayed/badgesEarned for every game in dev builds.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current) return;
    const humans = players.filter((p) => p.type === 'human');
    if (humans.length === 0 || !onRecordProfileResult) return;
    recordedRef.current = true;
    const bestHuman = [...humans].sort((a, b) => netWorth(b, assetPrices) - netWorth(a, assetPrices))[0];
    const result = onRecordProfileResult({
      netWorth: netWorth(bestHuman, assetPrices),
      passiveIncome: passiveIncome(bestHuman, { allPlayers: players, prices: assetPrices, month, weatherIncomeAmounts: state.weatherIncomeAmounts }),
      badgesEarnedThisGame: bestHuman.badges.length,
      // businessSeq is a monotonic "how many businesses has this player
      // EVER started" counter (see game/actions.js's startBusiness) — the
      // right lifetime count even though some may have since been sold.
      businessesStartedThisGame: bestHuman.businessSeq || 0,
      businessesSoldThisGame: (bestHuman.soldBusinesses || []).length,
    });
    if (result && (result.newlyUnlockedAvatars.length > 0 || result.newlyUnlockedThemes.length > 0)) {
      setUnlockCelebration(result);
      playSound('badge');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back to the opening theme for the big finish — same track SetupScreen
  // uses, so "Play Again" (GameOver → Setup) doesn't restart it.
  useEffect(() => {
    playMusicTrack('theme');
  }, []);

  function handlePlayAgain() {
    playSound('click');
    onPlayAgain();
  }

  // "What did the board actually look like at the end?" — reopens the same
  // ArenaGameBoard the game was just played on, read-only. Only shown when
  // the caller (ArenaGameBoard.jsx) wired it up.
  function handleViewBoard() {
    playSound('click');
    onViewBoard?.();
  }

  function handleSaveScore() {
    const trimmed = scoreName.trim();
    if (!trimmed || isOffensiveName(trimmed)) {
      setNameError(true);
      playSound('error');
      return;
    }
    setNameError(false);
    const entry = addEntry({
      name: trimmed,
      avatar: winner.avatar,
      netWorth: netWorth(winner, assetPrices),
      mode: mode?.type,
      difficultyId,
      email: scoreEmail,
      dailyChallengeDate: dailyChallengeDate || null,
      // A frozen "hard copy" of exactly what the winner owned when they
      // saved — see game/players.js snapshotPortfolio + game/leaderboard.js.
      portfolio: snapshotPortfolio(winner, assetPrices),
    });
    setSavedEntryId(entry.id);
    setSavedRank(entry.rank);

    // Also publish to the shared board, so the score survives this browser
    // and shows up for other players. Deliberately fire-and-report rather
    // than awaited: the local save has already succeeded and the
    // celebration should not wait on the network. The email typed above is
    // NOT sent — it stays local, in localStorage; a public, unauthenticated
    // table is no place for it.
    if (globalBoard.available) {
      setGlobalStatus('saving');
      globalBoard
        .submit({
          name: trimmed,
          avatar: winner.avatar,
          netWorth: netWorth(winner, assetPrices),
          mode: mode?.type,
          difficultyId,
          scenarioId,
          weatherSeverityId: state.weatherSeverityId,
          dailyChallengeDate: dailyChallengeDate || null,
          monthsPlayed: state.totalMonths,
        })
        .then((saved) => setGlobalStatus(saved ? 'saved' : 'failed'));
    }
    // A Top 20 finish gets the bigger celebration; everyone else still gets
    // the regular save-confirmation chime.
    if (entry.rank >= 1 && entry.rank <= LEADERBOARD_TOP_HIGHLIGHT) {
      playSound('applause');
    } else {
      playSound('badge');
    }
  }

  function openRecap() {
    playSound('click');
    setShowRecap(true);
  }

  // Plain-text records a family or classroom can keep after the browser
  // tab closes — see game/gameRecord.js for what each one contains. Works
  // the same for an online-mode multiplayer game as it does solo/hotseat.
  // Filenames are stamped with today's date so a household running several
  // game nights doesn't overwrite last week's download.
  const fileDateStamp = new Date().toISOString().slice(0, 10);
  function handleDownloadScore() {
    playSound('click');
    downloadTextFile(`ventureflow-score-${slugForFilename(winner.name)}-${fileDateStamp}.txt`, buildScoreReport(state));
  }
  function handleDownloadLedger() {
    playSound('click');
    downloadTextFile(`ventureflow-ledger-${fileDateStamp}.txt`, buildLedgerReport(state));
  }
  function handleDownloadPlayByPlay() {
    playSound('click');
    downloadTextFile(`ventureflow-play-by-play-${fileDateStamp}.txt`, buildPlayByPlayReport(state));
  }

  // A self-contained link (the recap data lives in the URL itself, see
  // game/recapShare.js) a parent or teacher can open with nothing but a
  // browser — no account, no room lookup, no server round trip. Shares the
  // exact same clipboard-with-a-prompt-fallback pattern as
  // handleShareResult below, since both are "put some text where the user
  // can paste it" in the end.
  async function handleCopyRecapLink() {
    playSound('click');
    const url = buildRecapShareUrl(state);
    try {
      await navigator.clipboard.writeText(url);
      setRecapLinkCopied(true);
      setTimeout(() => setRecapLinkCopied(false), 2500);
    } catch {
      // eslint-disable-next-line no-alert
      window.prompt('Copy this recap link:', url);
    }
  }

  // Actually sends the recap by email, via a small Supabase Edge Function
  // (send-recap-email) that calls Resend's API from a venturemaker.org
  // address. Works the same for an online-mode multiplayer game as it does
  // solo/hotseat — the function only cares about the link and a couple of
  // display strings, not which mode produced the game. Falls back to
  // suggesting Copy Recap Link if the send fails (e.g. before Resend is
  // fully set up on the backend).
  async function handleEmailRecap(e) {
    e.preventDefault();
    playSound('click');
    const to = recapEmail.trim();
    if (!to) return;
    setRecapEmailStatus('sending');
    setRecapEmailError('');
    try {
      const recapUrl = buildRecapShareUrl(state);
      const resp = await fetch(RECAP_EMAIL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, recapUrl, winnerName: winner.name, scenarioName: scenario.name }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'The email could not be sent.');
      setRecapEmailStatus('sent');
      setTimeout(() => setRecapEmailStatus('idle'), 3000);
    } catch (err) {
      setRecapEmailStatus('error');
      setRecapEmailError(err.message || 'The email could not be sent — try Copy Recap Link instead.');
    }
  }

  async function handleShareResult() {
    playSound('click');
    const human = players.find((p) => p.type === 'human');
    if (!human) return;
    const text = buildDailyChallengeShareText({
      dateString: dailyChallengeDate,
      finalNetWorth: netWorth(human, assetPrices),
      netWorthHistory: human.netWorthHistory,
      rank: savedRank,
    });
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Clipboard API unavailable/denied — fall back to a prompt so the
      // text is still reachable (select-all, copy) rather than silently
      // doing nothing.
      // eslint-disable-next-line no-alert
      window.prompt('Copy your result:', text);
    }
  }

  // Which players (if any) hit the scenario's objective — see
  // game/scenarios.js; Classic Growth and Survive the Crash have none.
  const objectiveAchievers = scenario.objective ? players.filter((p) => p.scenarioGoalMonth != null) : [];
  const survivedCrash = scenario.id === 'survivalCrash' ? netWorth(winner, assetPrices) > winner.cash : false;

  return (
    <div className="vf-gameover">
      <Fireworks />
      <div className="vf-topbar-corner">
        <VolumeControl />
        <MusicControl />
        {/* A second Play Again, up here as well as at the very bottom. The
            game-over screen is long — standings, the net-worth chart, the
            insights, the save-your-score form — and someone who just wants
            another game should not have to scroll past all of it first. */}
        <button type="button" className="vf-btn vf-btn--sm vf-btn--go" onClick={handlePlayAgain}>
          🔁 Play Again
        </button>
      </div>
      <div className="vf-card vf-gameover__inner">
        <Brand size="md" align="center" />
        <div className="vf-gameover__trophy">🏆</div>
        <h1>Game Over!</h1>
        <div className="vf-gameover__winner">
          {winner.avatar} {winner.name} {winner.name.toLowerCase() === 'you' ? 'win' : 'wins'} with $
          {netWorth(winner, assetPrices).toLocaleString()}!
        </div>

        <div className="vf-gameover__scenario-pill">
          <span className="vf-pill">
            {scenario.icon} {scenario.name}
            {dailyChallengeDate && ' · 🗓️ Today\'s Challenge'}
          </span>
        </div>

        {scenario.objective && (
          <p className="vf-gameover__objective">
            {objectiveAchievers.length > 0
              ? `🎯 Goal reached! ${objectiveAchievers.map((p) => `${p.avatar} ${p.name}`).join(', ')} hit the scenario objective.`
              : "🎯 Nobody quite reached this scenario's goal this time — give it another shot!"}
          </p>
        )}
        {scenario.id === 'survivalCrash' && (
          <p className="vf-gameover__objective">
            {survivedCrash
              ? `⛈️ You started this game in a storm and still grew your money — nice recovery!`
              : `⛈️ Starting in a storm is tough — you finished lower than you started this time. Try again?`}
          </p>
        )}

        {unlockCelebration && (
          <div className="vf-gameover__unlock">
            🎉 New unlock!{' '}
            {unlockCelebration.newlyUnlockedAvatars.map((a) => (
              <span key={a}>{a} </span>
            ))}
            {unlockCelebration.newlyUnlockedThemes.map((t) => (
              <span key={t.id}>
                {t.icon} {t.name} theme{' '}
              </span>
            ))}
            — check "🏅 Unlocks" on the setup screen!
          </div>
        )}

        <div className="vf-standings">
          {ranked.map((player, i) => (
            <button
              key={player.id}
              type="button"
              className={`vf-standing-row ${player.id === winnerId ? 'vf-standing-row--winner' : ''}`}
              onClick={() => {
                playSound('click');
                setSelectedPlayerId(player.id);
              }}
              title="Tap for a full portfolio breakdown"
            >
              <span className="vf-standing-row__rank">{i + 1}</span>
              <span>
                {player.avatar} {player.name}
                <WealthPile netWorth={netWorth(player, assetPrices)} />
              </span>
              <span>${netWorth(player, assetPrices).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <p className="vf-gameover__standings-hint">🔍 Tap a player for their full portfolio breakdown</p>

        <div className="vf-card vf-gameover__chart-card">
          <div className="vf-section-title">
            <span>📊</span>
            <span>How your money grew</span>
          </div>
          <NetWorthChart players={players} />
          {insights.length > 0 && (
            <div className="vf-gameover__insights">
              {insights.map((insight) => (
                <p key={insight.text} className="vf-gameover__insight">
                  {insight.icon} {insight.text}
                </p>
              ))}
            </div>
          )}
        </div>

        {closingChat.length > 0 && (
          <div className="vf-card vf-gameover__chat">
            {closingChat.map((c) => (
              <ChatEntryRow key={c.id} entry={c} />
            ))}
          </div>
        )}

        <div className="vf-card vf-save-score">
          <div className="vf-save-score__title">
            {savedEntryId ? '🎉 Added to the Leaderboard!' : `🏆 ${winner.avatar} Add your win to the Leaderboard!`}
          </div>

          {savedEntryId && globalStatus && (
            <p className="vf-save-score__global">
              {globalStatus === 'saving'
                ? '🌍 Publishing to the global leaderboard…'
                : globalStatus === 'saved'
                ? '🌍 Published to the global leaderboard — other players can see it now.'
                : "🌍 Couldn't reach the global leaderboard, so this one is saved on this device only."}
            </p>
          )}
          {savedEntryId ? (
            <>
              <p className="vf-save-score__success">Nice work, {scoreName}! Your score is saved.</p>
              {savedRank >= 1 && savedRank <= LEADERBOARD_TOP_HIGHLIGHT && (
                <p className="vf-save-score__top20">
                  👏 Top {LEADERBOARD_TOP_HIGHLIGHT}! You landed at #{savedRank} on the Leaderboard!
                </p>
              )}
              <button
                type="button"
                className="vf-btn vf-btn--primary vf-btn--block"
                onClick={() => {
                  playSound('click');
                  setShowLeaderboard(true);
                }}
              >
                View Leaderboard
              </button>
            </>
          ) : (
            <>
              <div>
                <span className="vf-field-label">Name to show on the Leaderboard</span>
                <input
                  className="vf-text-input"
                  type="text"
                  value={scoreName}
                  onChange={(e) => {
                    setScoreName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                  maxLength={20}
                />
                {nameError && <span className="vf-field-error">Please pick a different name.</span>}
              </div>
              <div>
                <span className="vf-field-label">Email (optional)</span>
                <input
                  className="vf-text-input"
                  type="email"
                  placeholder="you@example.com"
                  value={scoreEmail}
                  onChange={(e) => setScoreEmail(e.target.value)}
                  maxLength={80}
                />
                <span className="vf-save-score__hint">Never shown on the Leaderboard — just kept private.</span>
              </div>
              <button type="button" className="vf-btn vf-btn--go vf-btn--block" onClick={handleSaveScore}>
                Save My Score
              </button>
            </>
          )}
        </div>

        <div className="vf-gameover__actions">
          {dailyChallengeDate && (
            <button type="button" className="vf-btn vf-btn--ghost" onClick={handleShareResult}>
              {shareCopied ? '✅ Copied!' : '📤 Share Result'}
            </button>
          )}
          <button type="button" className="vf-btn vf-btn--ghost" onClick={openRecap}>
            📋 Family Recap
          </button>
          {onViewBoard && (
            <button type="button" className="vf-btn vf-btn--ghost" onClick={handleViewBoard}>
              🗺️ View Game Board
            </button>
          )}
          <button type="button" className="vf-btn vf-btn--go vf-btn--lg" onClick={handlePlayAgain}>
            Play Again 🔁
          </button>
        </div>

        {/* Plain-text takeaways for a family game night or classroom record
            — nothing to sign in for, nothing that leaves the device unless
            someone shares the file themselves. See game/gameRecord.js. */}
        <div className="vf-gameover__downloads">
          <div className="vf-gameover__downloads-title">⬇️ Download this game's record</div>
          <div className="vf-gameover__downloads-row">
            <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleDownloadScore}>
              🏆 Score
            </button>
            <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleDownloadLedger}>
              📒 Ledger
            </button>
            <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleDownloadPlayByPlay}>
              📜 Play by Play
            </button>
          </div>
          {/* A parent or teacher who wasn't at the table doesn't need a
              file at all — a link they can open cold gives them the same
              standings/concepts/insights a downloaded file would, with zero
              setup on their end. See game/recapShare.js + RecapViewer.jsx. */}
          <div className="vf-gameover__downloads-title" style={{ marginTop: '0.6rem' }}>
            👪 Share with a parent or teacher
          </div>
          <div className="vf-gameover__downloads-row">
            <button type="button" className="vf-btn vf-btn--sm vf-btn--ghost" onClick={handleCopyRecapLink}>
              {recapLinkCopied ? '✅ Link copied!' : '🔗 Copy Recap Link'}
            </button>
          </div>
          <form className="vf-gameover__email-row" onSubmit={handleEmailRecap}>
            <input
              type="email"
              className="vf-text-input vf-gameover__email-input"
              placeholder="parent or teacher's email"
              value={recapEmail}
              onChange={(e) => {
                setRecapEmail(e.target.value);
                if (recapEmailStatus === 'error') setRecapEmailStatus('idle');
              }}
              maxLength={254}
            />
            <button
              type="submit"
              className="vf-btn vf-btn--sm vf-btn--ghost"
              disabled={recapEmailStatus === 'sending' || !recapEmail.trim()}
            >
              {recapEmailStatus === 'sending' ? 'Sending…' : recapEmailStatus === 'sent' ? '✅ Sent!' : '📧 Email Recap'}
            </button>
          </form>
          {recapEmailStatus === 'error' && <span className="vf-field-error">{recapEmailError}</span>}
        </div>

        <div className="vf-gameover__venturemaker">
          <VentureMakerLink />
        </div>
      </div>

      <LeaderboardModal open={showLeaderboard} onClose={() => setShowLeaderboard(false)} highlightId={savedEntryId} />
      <FamilyRecapModal open={showRecap} onClose={() => setShowRecap(false)} state={state} prices={assetPrices} />
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          prices={assetPrices}
          allPlayers={players}
          month={month}
          weather={state.weather}
          weatherIncomeAmounts={state.weatherIncomeAmounts}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
}
