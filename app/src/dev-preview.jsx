// DEV-ONLY smoke-test harness — not part of the shipped app, not imported
// from main.jsx/App.jsx. Renders ArenaGameBoard against hand-built game
// states (via the real gameReducer's START_GAME, then scenario overrides)
// so every viewer-identity branch (my turn / another human's turn / AI's
// turn, my fortune card / another human's / an AI's, my exit offer /
// another's, game over) can be screenshotted without a live Supabase room.
// Pick a scenario with ?scenario=<name> — see SCENARIOS below.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { gameReducer } from './vendor/game-engine/reducer.js';
import { seedRng } from './vendor/game-engine/rng.js';
import ArenaGameBoard from './pages/room/ArenaGameBoard.jsx';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/dancing-script/600.css';

seedRng('dev-preview-seed');
const base = gameReducer(null, {
  type: 'START_GAME',
  mode: {
    type: 'online',
    seats: [
      { type: 'human', name: 'Michael', avatar: '🦈' },
      { type: 'human', name: 'Jordan', avatar: '🦁' },
      { type: 'ai', personalityId: undefined },
    ],
  },
});

const me = base.players[0];
const otherHuman = base.players[1];
const bot = base.players[2];

const fortuneCardTemplate = {
  card: { icon: '📈', title: 'Side Hustle Bonus', flavor: 'A weekend gig paid off big time.', why: 'Extra effort, extra cash.' },
  deckId: 'opportunity',
  description: '+$150 cash',
};

const exitOfferTemplate = {
  business: { name: 'Lemonade Empire' },
  multiplier: 4,
  payout: 3600,
  income: 75,
  annualIncome: 900,
};

const SCENARIOS = {
  myTurn: { ...base, status: 'playing', activePlayerIndex: 0 },
  otherHumanTurn: { ...base, status: 'playing', activePlayerIndex: 1 },
  aiTurn: { ...base, status: 'playing', activePlayerIndex: 2 },
  fortuneCardMine: {
    ...base,
    status: 'monthRecap',
    fortuneRecapIndex: 0,
    fortuneRecap: [{ ...fortuneCardTemplate, playerId: me.id, playerName: me.name, avatar: me.avatar }],
  },
  fortuneCardOtherHuman: {
    ...base,
    status: 'monthRecap',
    fortuneRecapIndex: 0,
    fortuneRecap: [{ ...fortuneCardTemplate, playerId: otherHuman.id, playerName: otherHuman.name, avatar: otherHuman.avatar }],
  },
  fortuneCardAi: {
    ...base,
    status: 'monthRecap',
    fortuneRecapIndex: 0,
    fortuneRecap: [{ ...fortuneCardTemplate, playerId: bot.id, playerName: bot.name, avatar: bot.avatar }],
  },
  exitOfferMine: {
    ...base,
    status: 'exitOffer',
    pendingExitOffer: { ...exitOfferTemplate, playerId: me.id },
  },
  exitOfferOtherHuman: {
    ...base,
    status: 'exitOffer',
    pendingExitOffer: { ...exitOfferTemplate, playerId: otherHuman.id },
  },
  gameOver: {
    ...base,
    status: 'gameover',
    winnerId: me.id,
    players: base.players.map((p, i) => (i === 0 ? { ...p, cash: p.cash + 5000 } : p)),
  },
};

const params = new URLSearchParams(window.location.search);
const scenarioName = params.get('scenario') || 'myTurn';
const gameState = SCENARIOS[scenarioName];

const fakeRoom = { id: '00000000-0000-0000-0000-000000000000', invite_code: 'DEVDEV' };

if (!gameState) {
  document.getElementById('root').textContent = `Unknown scenario "${scenarioName}". Known: ${Object.keys(SCENARIOS).join(', ')}`;
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ArenaGameBoard
        room={fakeRoom}
        gameState={gameState}
        mySeatIndex={0}
        session={{ user: { id: 'dev-preview-user' } }}
        onChanged={async () => {}}
        onLeave={() => {}}
      />
    </React.StrictMode>
  );
}
