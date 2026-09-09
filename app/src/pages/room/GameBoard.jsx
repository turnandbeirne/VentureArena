import { useState } from 'react';
import { ASSETS, BADGES, BUSINESS_COST, BUSINESS_SKILL_COST, BUSINESS_UPGRADE_TRACKS } from '../../vendor/data/gameConfig.js';
import { netWorth } from '../../vendor/game-engine/players.js';
import { resolveMove } from '../../lib/supabaseClient.js';

const BADGES_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));
const TRACKS = Object.values(BUSINESS_UPGRADE_TRACKS);

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function PlayerCard({ player, seatIndex, isActive, isMe, prices }) {
  return (
    <div className={`arena-player-card ${isActive ? 'active' : ''} ${isMe ? 'mine' : ''}`}>
      <div className="arena-player-card-head">
        <span className="arena-player-avatar">{player.avatar}</span>
        <span className="arena-player-name">
          {player.name} {isMe ? '(you)' : ''}
        </span>
        {player.type === 'ai' && <span className="arena-badge">AI</span>}
        {isActive && <span className="arena-badge status-active">turn</span>}
      </div>
      <div className="arena-player-stats">
        <span>Cash {money(player.cash)}</span>
        <span>Net worth {money(netWorth(player, prices))}</span>
        <span>Skill tokens {player.skillTokens}</span>
        <span>Businesses {player.businesses.length}</span>
      </div>
      {player.badges?.length > 0 && (
        <div className="arena-badge-row">
          {player.badges.map((id) => {
            const b = BADGES_BY_ID[id];
            if (!b) return null;
            return (
              <span className="arena-badge" key={id} title={b.description}>
                {b.icon} {b.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GameBoard({ room, gameState, mySeatIndex, session, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [qty, setQty] = useState({});
  const [chatText, setChatText] = useState('');

  const myPlayer = mySeatIndex != null ? gameState.players[mySeatIndex] : null;
  const isMyTurn = mySeatIndex != null && gameState.status === 'playing' && gameState.activePlayerIndex === mySeatIndex;

  async function act(action) {
    setError(null);
    setBusy(true);
    try {
      await resolveMove(room.id, action);
      await onChanged();
    } catch (err) {
      setError(err.message || 'That move was rejected');
    } finally {
      setBusy(false);
    }
  }

  if (gameState.status === 'gameover') {
    const standings = gameState.players
      .map((p, i) => ({ ...p, seatIndex: i, nw: netWorth(p, gameState.assetPrices) }))
      .sort((a, b) => b.nw - a.nw);
    return (
      <div className="arena-panel">
        <h2>Game over 🏁</h2>
        <ol className="arena-standings">
          {standings.map((p) => (
            <li key={p.id}>
              {p.avatar} {p.name} — {money(p.nw)} net worth
              {gameState.winnerId === p.id ? ' 🏆' : ''}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="arena-error">{error}</div>}

      <div className="arena-panel">
        <h2>
          Month {gameState.month} / {gameState.totalMonths}
        </h2>
        <div className="arena-player-grid">
          {gameState.players.map((p, i) => (
            <PlayerCard
              key={p.id}
              player={p}
              seatIndex={i}
              isActive={gameState.status === 'playing' && gameState.activePlayerIndex === i}
              isMe={i === mySeatIndex}
              prices={gameState.assetPrices}
            />
          ))}
        </div>
      </div>

      {gameState.status === 'exitOffer' && (
        <div className="arena-panel arena-panel-highlight">
          <h2>Buyout offer</h2>
          {gameState.pendingExitOffer?.playerId === myPlayer?.id ? (
            <>
              <p>Someone wants to buy one of your businesses. Accept the offer?</p>
              <button className="arena-button primary arena-button-inline" disabled={busy} onClick={() => act({ type: 'RESOLVE_EXIT_OFFER', accept: true })}>
                Accept
              </button>
              <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => act({ type: 'RESOLVE_EXIT_OFFER', accept: false })}>
                Decline
              </button>
            </>
          ) : (
            <p className="arena-muted">Waiting on a buyout decision from another player…</p>
          )}
        </div>
      )}

      {gameState.status === 'monthRecap' && gameState.fortuneRecapIndex < (gameState.fortuneRecap?.length || 0) && (
        <div className="arena-panel arena-panel-highlight">
          {(() => {
            const entry = gameState.fortuneRecap[gameState.fortuneRecapIndex];
            return (
              <>
                <h2>
                  {entry.card.icon} {entry.card.title}
                </h2>
                <p>
                  {entry.avatar} {entry.playerName}
                </p>
                <p>{entry.card.flavor}</p>
                <p className="arena-muted">{entry.description}</p>
              </>
            );
          })()}
          <button className="arena-button primary" disabled={busy} onClick={() => act({ type: 'ACK_FORTUNE_CARD' })}>
            Continue
          </button>
        </div>
      )}

      {myPlayer && myPlayer.type === 'human' && (
        <div className="arena-panel">
          <div className="arena-panel-header">
            <h2>{isMyTurn ? 'Your turn' : `Waiting for ${gameState.players[gameState.activePlayerIndex]?.name}`}</h2>
            <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => act({ type: 'CONVERT_SEAT_TO_AI' })}>
              Resign to AI
            </button>
          </div>

          {isMyTurn && (
            <>
              <h3>Assets</h3>
              <div className="arena-asset-grid">
                {ASSETS.map((asset) => {
                  const price = gameState.assetPrices[asset.id];
                  const owned = myPlayer.holdings[asset.id] || 0;
                  const q = qty[asset.id] ?? 1;
                  return (
                    <div className="arena-asset-row" key={asset.id}>
                      <span>
                        {asset.icon} {asset.name}
                      </span>
                      <span className="arena-muted">
                        {money(price)}/unit · own {owned}
                      </span>
                      <input
                        className="arena-qty-input"
                        type="number"
                        min={1}
                        value={q}
                        onChange={(e) => setQty((prev) => ({ ...prev, [asset.id]: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                      <button
                        className="arena-button primary arena-button-inline"
                        disabled={busy}
                        onClick={() => act({ type: 'BUY_ASSET', assetId: asset.id, qty: q })}
                      >
                        Buy
                      </button>
                      <button
                        className="arena-button secondary arena-button-inline"
                        disabled={busy || owned < q}
                        onClick={() => act({ type: 'SELL_ASSET', assetId: asset.id, qty: q })}
                      >
                        Sell
                      </button>
                    </div>
                  );
                })}
              </div>

              <h3>Businesses</h3>
              <button
                className="arena-button secondary"
                disabled={busy || myPlayer.cash < BUSINESS_COST || myPlayer.skillTokens < BUSINESS_SKILL_COST}
                onClick={() => act({ type: 'START_BUSINESS' })}
              >
                Start a new business ({money(BUSINESS_COST)} + {BUSINESS_SKILL_COST} skill token)
              </button>
              <button className="arena-button secondary" disabled={busy} onClick={() => act({ type: 'LEARN_SKILL' })}>
                Learn a skill (get a skill token)
              </button>
              {myPlayer.businesses.map((biz) => (
                <div className="arena-business-card" key={biz.id}>
                  <div>
                    <strong>{biz.name}</strong> — {money(biz.income)}/mo
                  </div>
                  <div className="arena-chip-row">
                    {TRACKS.map((track) => (
                      <button
                        key={track.id}
                        className="arena-chip"
                        disabled={busy}
                        title={track.blurb}
                        onClick={() => act({ type: 'UPGRADE_BUSINESS', businessId: biz.id, trackId: track.id })}
                      >
                        {track.icon} {track.name} ({money(track.cost)})
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <button className="arena-button primary" disabled={busy} onClick={() => act({ type: 'END_TURN' })}>
                End turn
              </button>
            </>
          )}
        </div>
      )}

      <div className="arena-panel">
        <h2>Activity</h2>
        <div className="arena-log">
          {[...(gameState.log || [])]
            .slice(-40)
            .reverse()
            .map((entry) => (
              <div className="arena-log-row" key={entry.id}>
                {entry.icon && <span>{entry.icon}</span>}
                <span>
                  {gameState.players.find((p) => p.id === entry.playerId)?.name || ''} {entry.message}
                </span>
              </div>
            ))}
        </div>

        <h3>Chat</h3>
        <div className="arena-log">
          {[...(gameState.chat || [])]
            .slice(-20)
            .map((c, i) => (
              <div className="arena-log-row" key={i}>
                <strong>{c.speakerName}:</strong> {c.message}
              </div>
            ))}
        </div>
        {myPlayer && myPlayer.type === 'human' && (
          <form
            className="arena-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatText.trim()) return;
              act({ type: 'SEND_CHAT', message: chatText.trim() });
              setChatText('');
            }}
          >
            <input className="arena-field" placeholder="Say something…" value={chatText} onChange={(e) => setChatText(e.target.value)} />
            <button className="arena-button primary arena-button-inline" type="submit" disabled={busy}>
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
