import { useEffect, useState } from 'react';
import { arenaRecord, listColors, requestFriend, sendChallenge, TIER_LABELS } from '../lib/arena.js';
import Avatar from '../components/Avatar.jsx';
import ArenaRecord from '../components/ArenaRecord.jsx';

// A member's public Arena Record page (blueprint §13: the shareable credential).
export default function Member({ session, userId, onBack }) {
  const [record, setRecord] = useState(null);
  const [colors, setColors] = useState([]);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const isMe = userId === session.user.id;

  useEffect(() => {
    setRecord(null);
    arenaRecord(userId).then(setRecord).catch((err) => setError(err.message));
    listColors().then(setColors).catch(() => {});
  }, [userId]);

  async function act(fn, msg) {
    setError(null);
    try {
      await fn();
      setToast(msg);
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  const p = record?.profile;
  const colorHex = colors.find((c) => c.key === p?.color_ranks?.[0])?.hex ?? null;

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <button className="arena-button secondary arena-button-inline" onClick={onBack}>← Back</button>
      </div>
      {error && <div className="arena-error">{error}</div>}
      {toast && <div className="va-toast">{toast}</div>}
      {!p && !error && <p className="arena-muted">Loading…</p>}
      {p && (
        <>
          <section className="arena-panel va-member-head">
            <Avatar profile={p} size={88} color={colorHex} />
            <div className="va-member-text">
              <h1>{p.display_name}</h1>
              <p className="subtitle">
                {record.persona?.label || 'Explorer'} · {TIER_LABELS[p.tier] || 'Free'}{p.is_guest ? ' guest' : ' member'}
                {p.business_stage ? ` · ${p.business_stage}` : ''}{p.industry ? ` · ${p.industry}` : ''}
              </p>
              {p.headline && <p className="va-member-headline">{p.headline}</p>}
              {p.looking_for && <p className="arena-muted">Looking for: {p.looking_for}</p>}
            </div>
            {!isMe && (
              <div className="va-person-actions">
                <button className="arena-button primary arena-button-inline" onClick={() => act(() => sendChallenge(userId), 'Challenge sent')}>Challenge</button>
                {!session.user.is_anonymous && !p.is_guest && (
                  <button className="arena-button secondary arena-button-inline" onClick={() => act(() => requestFriend(userId), 'Friend request sent')}>Add friend</button>
                )}
              </div>
            )}
          </section>
          <section className="arena-panel">
            <h2>Arena Record</h2>
            <ArenaRecord record={record} colorHex={colorHex} />
          </section>
        </>
      )}
    </div>
  );
}
