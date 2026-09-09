import { useState } from 'react';
import { isOffensiveName } from '../../game-engine/nameFilter';
import { playSound } from '../audio/soundEngine';

const DEFAULT_CHAT_COLOR = '#868e96';
const MAX_MESSAGE_LENGTH = 140;

/** One chat bubble — color-coded to the speaking bot's personality (falls
 * back to a neutral gray for an entry saved before personality colors
 * existed) on top of its avatar icon, so who's talking is clear even at a
 * glance. A `category: 'sfx'` entry (a goof-off sound effect — see
 * game/chatEngine.js's generateBotTurnFlavor) gets a slightly different
 * treatment (dashed border, italic) to read as "a noise", not a sentence. A
 * `category: 'human'` entry (a player-typed message — see below) gets its
 * own highlighted look and shows who it was aimed at, if anyone. Exported
 * so GameOverScreen's closing-chat section can reuse the exact same look
 * for its gloat/applause lines. `players` is only needed to resolve a
 * human entry's target name — omit it for contexts (like GameOverScreen)
 * that never show human-authored entries. */
export function ChatEntryRow({ entry, players = [] }) {
  const color = entry.color || DEFAULT_CHAT_COLOR;
  const isSfx = entry.category === 'sfx';
  const isHuman = entry.category === 'human';
  const target = entry.targetPlayerId ? players.find((p) => p.id === entry.targetPlayerId) : null;
  return (
    <div className={`vf-chat__entry ${isSfx ? 'vf-chat__entry--sfx' : ''} ${isHuman ? 'vf-chat__entry--human' : ''}`}>
      <span className="vf-chat__avatar" title={entry.speakerName}>
        {entry.speakerAvatar}
      </span>
      <div className="vf-chat__bubble" style={{ '--bot-color': color }}>
        <span className="vf-chat__name" style={{ color }}>
          {entry.speakerName}
          {target && (
            <span className="vf-chat__target">
              {' '}
              → {target.avatar} {target.name}
            </span>
          )}
        </span>
        <span className="vf-chat__message">{entry.message}</span>
      </div>
    </div>
  );
}

/** Type-your-own-message row at the bottom of the chat panel — lets a
 * human player (in hot-seat, whichever one is holding the device) send a
 * real message into the feed, optionally aimed at a specific bot or
 * another player. Robots can't actually read or understand it (there's no
 * language model here, just canned personality lines), but see
 * game/chatEngine.js's reactToHumanChat for the small chance a targeted
 * (or random) bot chimes back in character anyway, so it doesn't feel like
 * shouting into a void. */
/**
 * `fixedFromId` is undefined in solo/hotseat — every human player sitting at
 * this one device is a valid "sending as" choice, hence the dropdown below.
 * In the Arena's online mode it's set to the viewer's own player id: a
 * connected client is only ever ONE of the humans at the table, so it can
 * only ever speak as itself — the "sending as" dropdown is meaningless (and
 * would let one player's browser impersonate another's chat) and is hidden
 * entirely, exactly the way it already hides for a single-human game.
 */
function ChatComposer({ players, onSendChat, fixedFromId }) {
  const humans = fixedFromId ? players.filter((p) => p.id === fixedFromId) : players.filter((p) => p.type === 'human');
  const [fromId, setFromId] = useState(humans[0]?.id || '');
  const [toId, setToId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const activeFromId = fixedFromId || (humans.some((h) => h.id === fromId) ? fromId : humans[0]?.id);
  const targets = players.filter((p) => p.id !== activeFromId);

  function handleSend(e) {
    e.preventDefault();
    const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!trimmed) return;
    if (isOffensiveName(trimmed)) {
      setError(true);
      playSound('error');
      return;
    }
    setError(false);
    onSendChat(activeFromId, trimmed, toId || null);
    setMessage('');
  }

  return (
    <form className="vf-chat-composer" onSubmit={handleSend}>
      {humans.length > 1 && (
        <select
          className="vf-select vf-chat-composer__from"
          value={activeFromId}
          onChange={(e) => setFromId(e.target.value)}
          aria-label="Sending as"
        >
          {humans.map((h) => (
            <option key={h.id} value={h.id}>
              {h.avatar} {h.name}
            </option>
          ))}
        </select>
      )}
      <input
        className="vf-text-input vf-chat-composer__input"
        type="text"
        placeholder="Say something..."
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (error) setError(false);
        }}
        maxLength={MAX_MESSAGE_LENGTH}
      />
      <select
        className="vf-select vf-chat-composer__to"
        value={toId}
        onChange={(e) => setToId(e.target.value)}
        aria-label="Send to"
      >
        <option value="">Everyone</option>
        {targets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.avatar} {p.name}
          </option>
        ))}
      </select>
      <button type="submit" className="vf-btn vf-btn--sm vf-btn--primary" disabled={!message.trim()}>
        Send
      </button>
      {error && <span className="vf-field-error vf-chat-composer__error">Please pick different words.</span>}
    </form>
  );
}

// Bot personality chat feed — see game/chatEngine.js for when each entry
// gets generated. Robots do most of the talking (teasing, questioning,
// challenging, complimenting — and occasionally serenading everyone with a
// fart noise), but the composer below lets a human player join in too.
export default function ChatPanel({ chat, players, onSendChat, myPlayerId }) {
  const recent = [...(chat || [])].slice(-30).reverse();

  return (
    <div>
      <div className="vf-section-title">
        <span>💬</span>
        <span>Chat</span>
      </div>
      <div className="vf-card vf-chat-panel">
        <div className="vf-chat vf-scroll">
          {recent.length === 0 && (
            <span className="vf-log__empty">The robots will start chatting once the game gets going...</span>
          )}
          {recent.map((entry) => (
            <ChatEntryRow key={entry.id} entry={entry} players={players} />
          ))}
        </div>
        <ChatComposer players={players} onSendChat={onSendChat} fixedFromId={myPlayerId} />
      </div>
    </div>
  );
}
