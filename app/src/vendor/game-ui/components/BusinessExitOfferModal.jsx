import { BUSINESS_EXIT_RARITY_LABELS } from '../../data/gameConfig';
import { playSound } from '../audio/soundEngine';

/**
 * A buyout offer landed on a business this month — pauses the game (see
 * game/turnEngine.js's beginMonthEnd/resolveExitOfferDecision) so the human
 * who owns it can actually decide instead of the sale just auto-resolving.
 * Only ever rendered for a human target — an AI target's offer is decided
 * instantly (aiDecideExitOffer) and this component never mounts for it.
 *
 * `isMine` is undefined in solo/hotseat (the offer only ever targets
 * whoever's device this is) and a real player-id comparison in the Arena's
 * online mode, where every connected client sees the same pending offer but
 * only the targeted human can actually decide — everyone else gets a
 * read-only "waiting on a decision" line instead of live Accept/Decline
 * buttons, mirroring the pre-port bare-bones Arena board's own
 * pendingExitOffer.playerId check.
 */
export default function BusinessExitOfferModal({ offer, playerName, playerAvatar, onDecide, isMine }) {
  if (!offer) return null;
  const interactive = isMine !== false;
  const rarity = BUSINESS_EXIT_RARITY_LABELS[offer.multiplier] || 'rare';
  const bizName = offer.business?.name || 'this business';
  // A game saved/injected before this round's switch to annual-revenue
  // multipliers won't have `annualIncome` on its pending offer — fall back
  // to computing it from the monthly figure rather than showing undefined.
  const annualIncome = offer.annualIncome ?? offer.income * 12;

  function handleAccept() {
    playSound('cashRegister');
    onDecide(true);
  }

  function handleDecline() {
    playSound('click');
    onDecide(false);
  }

  return (
    <div className="vf-modal-overlay">
      <div className="vf-modal vf-modal--good">
        <div className="vf-modal__who">
          {playerAvatar} {playerName}'s Buyout Offer
        </div>
        <div className="vf-modal__icon">💼</div>
        <div className="vf-modal__title">Someone wants to buy {bizName}!</div>
        <p className="vf-modal__flavor">
          A buyer is offering <strong>${offer.payout.toLocaleString()}</strong> — {offer.multiplier}x its
          ${annualIncome.toLocaleString()}/yr annual revenue (${offer.income}/mo × 12, a {rarity} offer). Accept the
          cash now, or turn it down and keep the business (and everything it might earn — or lose — going forward).
        </p>
        <div className="vf-modal__effect vf-modal__effect--good">Offer: ${offer.payout.toLocaleString()}</div>
        <div className="vf-modal__why">
          <strong>Why?</strong> Selling a business for a multiple of its annual revenue is called an "exit" — the
          more you'd built up, the bigger the payday. But cash in hand isn't always better than a business that
          keeps paying you every month; there's no guarantee a better offer ever comes again.
        </div>
        {interactive ? (
          <div className="vf-modal__actions">
            <button type="button" className="vf-btn vf-btn--ghost vf-btn--lg" onClick={handleDecline}>
              🤝 Keep Building
            </button>
            <button type="button" className="vf-btn vf-btn--primary vf-btn--lg" onClick={handleAccept}>
              💼 Accept ${offer.payout.toLocaleString()}
            </button>
          </div>
        ) : (
          <p className="vf-modal__waiting">⏳ Waiting on {playerName || 'them'} to decide…</p>
        )}
      </div>
    </div>
  );
}
