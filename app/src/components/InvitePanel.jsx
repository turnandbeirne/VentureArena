import { useEffect, useState } from 'react';
import { inviteUrl, logInvite, myReferralCode } from '../lib/arena.js';

// Invite by text, email, share sheet, or link. Delivery happens through the
// member's own phone/mail app (sms:, mailto:, Web Share API), so it works
// today with no messaging provider; every invite is logged with the member's
// referral code and credited when the friend joins (+20 points, friend request).
export default function InvitePanel({ session, roomCode = null, compact = false, title }) {
  const [code, setCode] = useState(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const isGuest = session.user.is_anonymous;

  useEffect(() => {
    if (isGuest) return;
    myReferralCode().then(setCode).catch(() => {});
  }, [isGuest]);

  const link = inviteUrl(code, roomCode);
  const who = name.trim() ? `${name.trim()}, ` : '';
  const message = roomCode
    ? `${who}come play VentureFlow with me at Venture Arena — where games mean business. Tap to grab a seat at my table: ${link}`
    : `${who}I'm playing business games with founders at Venture Arena — where games mean business. Come play me: ${link}`;

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2200); }

  async function send(channel) {
    setError(null);
    try {
      if (isGuest) throw new Error('Create a free account to invite friends (guests can still share a table link from the table).');
      await logInvite(channel, contact || null, name || null, roomCode);
      if (channel === 'sms') {
        const to = contact.trim().replace(/[^+\d]/g, '');
        // iOS wants '&body', Android accepts '?body'; the '?&' form works on both.
        window.location.href = `sms:${to}?&body=${encodeURIComponent(message)}`;
      } else if (channel === 'email') {
        const subject = roomCode ? 'Join my table at Venture Arena' : 'Come play me at Venture Arena';
        window.location.href = `mailto:${encodeURIComponent(contact.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      } else if (channel === 'share') {
        await navigator.share({ title: 'Venture Arena', text: message, url: link });
        flash('Shared');
      } else {
        await navigator.clipboard?.writeText(link);
        flash('Link copied');
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // user closed the share sheet
      setError(err.message);
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className={`va-invite ${compact ? 'compact' : ''}`}>
      {title !== null && <h2>{title ?? (roomCode ? 'Invite someone to this table' : 'Invite a friend to play')}</h2>}
      {!compact && <p className="arena-muted">Send a text or email from your phone, or share the link anywhere. When they join, you both get a friend request and you earn 20 Arena Points.</p>}
      {error && <div className="arena-error">{error}</div>}
      {toast && <div className="va-toast">{toast}</div>}
      <div className="va-invite-fields">
        <input className="arena-field" placeholder="Their name (optional)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <input className="arena-field" placeholder="Phone or email (optional)" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="va-invite-actions">
        <button type="button" className="arena-button primary arena-button-inline" onClick={() => send('sms')}>Text</button>
        <button type="button" className="arena-button primary arena-button-inline" onClick={() => send('email')}>Email</button>
        {canShare && <button type="button" className="arena-button secondary arena-button-inline" onClick={() => send('share')}>Share…</button>}
        <button type="button" className="arena-button secondary arena-button-inline" onClick={() => send('link')}>Copy link</button>
      </div>
      {code && !compact && <p className="va-invite-code">Your invite link: <span className="mono">{link}</span></p>}
    </div>
  );
}
