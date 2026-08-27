import { playSound } from '../audio/soundEngine';
import LessonTip from './LessonTip';

/**
 * `isMine` is undefined in solo/hotseat (the one device showing this modal
 * IS whoever it belongs to, so "Got it!" is always live there) and a real
 * player-id comparison in the Arena's online mode — every connected client
 * renders this same recap entry so the whole table sees what happened, but
 * only the entry's own owner gets a working "Got it!" button. Everyone else
 * sees a waiting line instead, same pattern as BusinessExitOfferModal.
 *
 * For an AI-owned entry there is no human to click "Got it!" at all —
 * ArenaGameBoard elects exactly one connected client to auto-advance those
 * (see its fortune-card effect) rather than passing isMine=false down here,
 * so this component only ever needs to know about the human-vs-human case.
 */
export default function FortuneCardModal({ entry, onContinue, isMine }) {
  if (!entry) return null;
  const { playerName, avatar, deckId, card, description } = entry;
  const good = deckId === 'opportunity';
  const interactive = isMine !== false;

  function handleContinue() {
    playSound('click');
    onContinue();
  }

  return (
    <div className="vf-modal-overlay">
      <div className={`vf-modal ${good ? 'vf-modal--good' : 'vf-modal--bad'}`}>
        <div className="vf-modal__who">
          {avatar} {playerName}'s Fortune Card
        </div>
        <div className="vf-modal__icon">{card.icon}</div>
        <div className="vf-modal__title">{card.title}</div>
        <p className="vf-modal__flavor">{card.flavor}</p>
        <div className={`vf-modal__effect ${good ? 'vf-modal__effect--good' : 'vf-modal__effect--bad'}`}>
          {description}
        </div>
        <div className="vf-modal__why">
          <strong>Why?</strong>
          {card.why}
          <LessonTip conceptId={good ? 'opportunity' : 'emergencyFund'} />
        </div>
        {interactive ? (
          <button type="button" className="vf-btn vf-btn--primary vf-btn--lg" onClick={handleContinue}>
            Got it!
          </button>
        ) : (
          <p className="vf-modal__waiting">⏳ Waiting for {playerName} to continue…</p>
        )}
      </div>
    </div>
  );
}
