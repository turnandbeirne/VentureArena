// Builds plain-text game records for download — score, cash ledger, and
// play-by-play — from a finished (or in-progress) game's state. Kept
// separate from downloadFile.js's actual file-saving mechanics so the
// report text itself is easy to read, tweak, and (if it's ever wanted)
// test on its own.
//
// Deliberately plain .txt, not .csv: the audience this is for (family game
// night, a classroom) wants something they can open and read top to
// bottom, or print, without needing a spreadsheet app. The numbers are
// still lined up in fixed-width columns so it reads cleanly either way.
//
// Ported from VentureFlow's own src/game/gameRecord.js — only the import
// paths differ (Arena's engine/data live two levels up from game-ui, not
// one), the report logic itself is identical, and works unchanged for an
// online-mode multiplayer game the same way it does for solo/hotseat.
import { getDifficulty, getScenario } from '../../data/gameConfig';
import { netWorth } from '../../game-engine/players';
import { getBadgeInfo } from '../../game-engine/badges';

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function rule(char = '-', len = 40) {
  return char.repeat(len);
}

function playerLabel(p) {
  return `${p.avatar} ${p.name}${p.type === 'ai' ? ' (AI)' : ''}`;
}

/** Final standings + badges — the "who won, by how much" record. */
export function buildScoreReport(state, { playedAt = Date.now() } = {}) {
  const difficulty = getDifficulty(state.difficultyId);
  const scenario = getScenario(state.scenarioId);
  const ranked = [...state.players].sort(
    (a, b) => netWorth(b, state.assetPrices) - netWorth(a, state.assetPrices)
  );

  const lines = [];
  lines.push('VentureFlow — Game Record');
  lines.push(rule('='));
  lines.push(`Scenario:   ${scenario.icon} ${scenario.name}`);
  lines.push(`Difficulty: ${difficulty.icon} ${difficulty.name}`);
  lines.push(`Played:     ${formatDate(playedAt)}`);
  lines.push(`Length:     ${state.totalMonths} months`);
  lines.push('');
  lines.push('FINAL STANDINGS');
  lines.push(rule());
  ranked.forEach((p, i) => {
    const isWinner = p.id === state.winnerId;
    const nw = Math.round(netWorth(p, state.assetPrices)).toLocaleString();
    lines.push(`${i + 1}. ${playerLabel(p)} — $${nw}${isWinner ? '   <-- WINNER' : ''}`);
  });

  const withBadges = ranked.filter((p) => (p.badges || []).length > 0);
  if (withBadges.length > 0) {
    lines.push('');
    lines.push('BADGES EARNED');
    lines.push(rule());
    withBadges.forEach((p) => {
      const names = p.badges
        .map((id) => {
          const b = getBadgeInfo(id);
          return b ? `${b.icon} ${b.name}` : id;
        })
        .join(', ');
      lines.push(`${playerLabel(p)}: ${names}`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

/** Every player's full cash-flow history — same rows LedgerModal shows,
 * for every player in one file instead of one at a time. */
export function buildLedgerReport(state) {
  const lines = [];
  lines.push('VentureFlow — Cash Ledger');
  lines.push(rule('='));

  state.players.forEach((p) => {
    const entries = p.ledger || [];
    const totalIn = entries.filter((e) => e.type === 'in').reduce((sum, e) => sum + e.amount, 0);
    const totalOut = entries.filter((e) => e.type === 'out').reduce((sum, e) => sum + e.amount, 0);
    lines.push('');
    lines.push(`${playerLabel(p)} — total in $${totalIn.toLocaleString()}, total out $${totalOut.toLocaleString()}`);
    lines.push(rule());
    if (entries.length === 0) {
      lines.push('  (no cash has moved yet)');
    } else {
      entries.forEach((e) => {
        const sign = e.type === 'in' ? '+' : '-';
        const month = `Mo.${String(e.month).padStart(2, '0')}`;
        const amount = `${sign}$${e.amount.toLocaleString()}`.padStart(9, ' ');
        lines.push(`  ${month}  ${amount}  ${e.source}${e.detail ? ` — ${e.detail}` : ''}`);
      });
    }
  });

  lines.push('');
  return lines.join('\n');
}

/** The full event log (and chat, if any) in order — the "what actually
 * happened" transcript of the whole game. */
export function buildPlayByPlayReport(state) {
  const lines = [];
  lines.push('VentureFlow — Play by Play');
  lines.push(rule('='));

  const log = state.log || [];
  if (log.length === 0) {
    lines.push('(nothing happened yet)');
  } else {
    log.forEach((e) => {
      const who = e.playerId ? state.players.find((p) => p.id === e.playerId)?.name : null;
      const month = `Mo.${String(e.month).padStart(2, '0')}`;
      lines.push(`${month}  ${e.icon || '•'}  ${who ? `${who} — ` : ''}${e.message}`);
    });
  }

  const chat = state.chat || [];
  if (chat.length > 0) {
    lines.push('');
    lines.push('CHAT');
    lines.push(rule());
    chat.forEach((c) => {
      const month = `Mo.${String(c.month).padStart(2, '0')}`;
      lines.push(`${month}  ${c.speakerName}: ${c.message}`);
    });
  }

  lines.push('');
  return lines.join('\n');
}
