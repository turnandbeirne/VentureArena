import { useState } from 'react';
import { expressPremiumInterest } from '../lib/arena.js';

// Membership (blueprint §9). Payments are stubbed in this build: the buttons
// register interest (vm_express_premium_interest) so we know who wants what
// before Stripe is wired in.
const TIERS = [
  { key: 'free', name: 'Free', price: '$0', blurb: 'Play, get a persona, keep 30 days of history.', perks: ['10 challenges a day', 'Persona preview', 'Open tournaments', 'Weekly digest'] },
  { key: 'member', name: 'Member', price: '$0.99 / mo', blurb: 'Your record, forever.', perks: ['Unlimited challenges', 'History and Arena Record kept forever', 'Full persona', 'Host up to 2 Tables', 'Ranked tournaments', 'Library of tips and recorded events', 'Monthly strategy session'] },
  { key: 'premium', name: 'Premium', price: '$9.99 / mo', blurb: 'For founders who host.', perks: ['Everything in Member', 'Early access to Lab games (VentureBoom next)', 'Host up to 10 Tables', 'Weekly strategy sessions', 'Group office hours monthly', 'Reserved signature color', 'Lead a Venture Track team'], featured: true },
  { key: 'vip', name: 'VIP', price: '$49 / mo', blurb: 'Coaching from entrepreneurs who have done it.', perks: ['Everything in Premium', '1:1 coaching monthly with priority booking', 'Private strategy sessions', 'Front-row AMAs with follow-up', 'Investor Demo Day access', 'Custom table color'] },
];

export default function Tiers({ session, profile }) {
  const [interest, setInterest] = useState(null);
  const [error, setError] = useState(null);
  const current = profile?.tier ?? 'free';
  const isGuest = session.user.is_anonymous;

  async function want(key) {
    setError(null);
    try {
      if (isGuest) throw new Error('Create a free account first — then pick a plan.');
      await expressPremiumInterest();
      setInterest(key);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <div>
          <h1>Membership</h1>
          <p className="subtitle">Where games mean business. Pick the seat that fits.</p>
        </div>
      </div>
      {error && <div className="arena-error">{error}</div>}
      {interest && <div className="va-notice">Noted — you're on the list for {TIERS.find((t) => t.key === interest)?.name}. Paid plans open soon; we'll email you first.</div>}
      <div className="va-tiers">
        {TIERS.map((t) => (
          <section key={t.key} className={`va-tier ${t.featured ? 'featured' : ''} ${current === t.key ? 'current' : ''}`}>
            <p className="va-eyebrow">{t.name}</p>
            <div className="va-tier-price">{t.price}</div>
            <p className="arena-muted">{t.blurb}</p>
            <ul className="va-tier-perks">
              {t.perks.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {current === t.key ? (
              <span className="va-tier-current">Your plan</span>
            ) : t.key === 'free' ? null : (
              <button className={`arena-button ${t.featured ? 'primary' : 'secondary'}`} onClick={() => want(t.key)}>Join the waitlist</button>
            )}
          </section>
        ))}
      </div>
      <p className="arena-muted va-fineprint">Anonymous guests can play by invite link and send 3 challenges a day. Paid plans bill monthly and can be cancelled any time once live.</p>
    </div>
  );
}
