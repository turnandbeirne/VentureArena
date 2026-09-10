import { useEffect, useState } from 'react';
import {
  cancelChallenge, fetchPersonas, fetchProfiles, findProfileByEmail, listFriendships, listMyChallenges, matchSuggestions,
  onlineMembers, recentTablemates, requestFriend, respondFriend, sendChallenge, timeAgo,
} from '../lib/arena.js';
import Avatar from '../components/Avatar.jsx';
import InvitePanel from '../components/InvitePanel.jsx';
import AccessNotice from '../components/AccessNotice.jsx';

// People (blueprint §5): who's online, friends and requests, members you've
// played with, and a way to find someone by email. Every card carries the
// two actions that matter: Challenge and Add friend.
export default function People({ session, access, onNavigate, onOpenRoom }) {
  const me = session.user.id;
  const isGuest = session.user.is_anonymous;
  const [online, setOnline] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [tablemates, setTablemates] = useState([]);
  const [matches, setMatches] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [personas, setPersonas] = useState({});
  const [challenges, setChallenges] = useState([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  async function refresh() {
    setError(null);
    try {
      const [on, fr, tm, ch, mt] = await Promise.all([onlineMembers(), listFriendships(me), recentTablemates(), listMyChallenges(), isGuest ? [] : matchSuggestions(12).catch(() => [])]);
      setOnline(on);
      setFriendships(fr);
      setTablemates(tm);
      setChallenges(ch);
      setMatches(mt);
      const ids = [...on.map((o) => o.id), ...fr.flatMap((f) => [f.user_id, f.friend_id]), ...tm.map((t) => t.user_id), ...ch.flatMap((c) => [c.challenger_id, c.challenged_id]), ...mt.map((m) => m.user_id)];
      const [p, x] = await Promise.all([fetchProfiles(ids), fetchPersonas(ids)]);
      setProfiles(p);
      setPersonas(x);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me]);

  async function act(fn, okMessage) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (okMessage) { setToast(okMessage); setTimeout(() => setToast(null), 2000); }
      await refresh();
      return result;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function lookup(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setBusy(true);
    try {
      const p = await findProfileByEmail(search.trim());
      setFound(p || null);
      if (p) {
        const more = await fetchProfiles([p.id]);
        setProfiles((prev) => ({ ...prev, ...more }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const friendStatus = (id) => {
    const row = friendships.find((f) => (f.user_id === me && f.friend_id === id) || (f.user_id === id && f.friend_id === me));
    if (!row) return null;
    if (row.status === 'accepted') return 'friends';
    if (row.status === 'pending') return row.user_id === me ? 'requested' : 'incoming';
    return row.status;
  };
  const pendingChallengeTo = (id) => challenges.find((c) => c.status === 'pending' && c.challenger_id === me && c.challenged_id === id);
  const friends = friendships.filter((f) => f.status === 'accepted').map((f) => (f.user_id === me ? f.friend_id : f.user_id));
  const incoming = friendships.filter((f) => f.status === 'pending' && f.friend_id === me).map((f) => f.user_id);

  function PersonCard({ id, sub, reasons, distance }) {
    const p = profiles[id];
    if (!p) return null;
    const status = friendStatus(id);
    const pending = pendingChallengeTo(id);
    const isOnline = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 3 * 60 * 1000;
    return (
      <div className="va-person-card">
        <button className="va-person-main" onClick={() => onNavigate('member', id)}>
          <Avatar profile={p} size={44} online={isOnline} />
          <div>
            <div className="va-person-name">{p.display_name} {p.tier && p.tier !== 'free' && <span className="va-tier-pill">{p.tier}</span>}</div>
            <div className="va-person-sub">{personas[id]?.label || (p.is_guest ? 'Guest' : 'Member')}{p.headline ? ` · ${p.headline}` : ''}{sub ? ` · ${sub}` : ''}{distance != null ? ` · ~${distance} km away` : ''}</div>
            {reasons?.length > 0 && <div className="va-reasons">{reasons.map((r) => <span className="va-reason" key={r}>{r}</span>)}</div>}
          </div>
        </button>
        <div className="va-person-actions">
          {pending ? (
            <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => act(() => cancelChallenge(pending.id))}>Challenge sent</button>
          ) : (
            <button className="arena-button primary arena-button-inline" disabled={busy} onClick={() => act(() => sendChallenge(id), `Challenge sent to ${p.display_name}`)}>Challenge</button>
          )}
          {!isGuest && !p.is_guest && (
            status === 'friends' ? <span className="arena-muted">Friends</span>
            : status === 'requested' ? <span className="arena-muted">Requested</span>
            : status === 'incoming' ? <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => act(() => respondFriend(id, true), 'Friend added')}>Accept</button>
            : <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => act(() => requestFriend(id), 'Friend request sent')}>Add friend</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <div>
          <h1>People</h1>
          <p className="subtitle">Find opponents, co-founders and mentors — then challenge them to a game.</p>
        </div>
      </div>
      {error && <div className="arena-error">{error}</div>}
      {toast && <div className="va-toast">{toast}</div>}
      <AccessNotice access={access} isGuest={isGuest} onNavigate={onNavigate} />

      <section className="arena-panel">
        <form className="arena-inline-form" onSubmit={lookup}>
          <input className="arena-field" type="email" placeholder="Find a member by email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="arena-button primary arena-button-inline" type="submit" disabled={busy}>Find</button>
        </form>
        {found === null && <p className="arena-muted">No member with that email yet — send them an invite link from any table.</p>}
        {found && <PersonCard id={found.id} />}
      </section>

      {!isGuest && (
        <section className="arena-panel">
          <h2>Good matches for you</h2>
          {access && !access.can_see_bios ? (
            <p className="arena-muted">Introductions unlock once your email is verified and your member profile is complete ({access.survey_score ?? 0}% so far). <button className="arena-link-button" onClick={() => onNavigate('me')}>Finish your profile</button></p>
          ) : matches.length === 0 ? (
            <p className="arena-muted">Fill in your goals, project and industry on the Me tab and play a game or two — matches appear as soon as there's something to match on.</p>
          ) : (
            <>
              <p className="arena-muted">Ranked by your goals and bios, industry and stage, playing styles, active projects, and (when you both share it) distance.</p>
              {matches.map((m) => <PersonCard key={m.user_id} id={m.user_id} reasons={m.reasons} distance={m.distance_km} />)}
            </>
          )}
        </section>
      )}

      <section className="arena-panel">
        <InvitePanel session={session} compact title="Bring a friend in" />
      </section>

      {incoming.length > 0 && (
        <section className="arena-panel arena-panel-highlight">
          <h2>Friend requests</h2>
          {incoming.map((id) => <PersonCard key={id} id={id} />)}
        </section>
      )}

      <section className="arena-panel">
        <h2>Online now</h2>
        {online.length === 0 ? <p className="arena-muted">Nobody else is online right now.</p> : online.map((o) => <PersonCard key={o.id} id={o.id} />)}
      </section>

      <section className="arena-panel">
        <h2>Friends</h2>
        {friends.length === 0 ? (
          <p className="arena-muted">{isGuest ? 'Create a free account to add friends.' : 'No friends yet. Add the people you play with.'}</p>
        ) : friends.map((id) => <PersonCard key={id} id={id} />)}
      </section>

      {tablemates.length > 0 && (
        <section className="arena-panel">
          <h2>Played with you</h2>
          {tablemates.map((t) => <PersonCard key={t.user_id} id={t.user_id} sub={`${t.games_together} game${t.games_together === 1 ? '' : 's'} together, last ${timeAgo(t.last_played)}`} />)}
        </section>
      )}

      {challenges.some((c) => c.status === 'accepted' && c.room_id) && (
        <section className="arena-panel">
          <h2>Accepted challenges</h2>
          {challenges.filter((c) => c.status === 'accepted' && c.room_id).map((c) => (
            <button key={c.id} className="arena-list-row" onClick={() => onOpenRoom(c.room_id)}>
              <div>
                <div className="arena-list-row-title">{profiles[c.challenger_id]?.display_name} vs {profiles[c.challenged_id]?.display_name}</div>
                <div className="arena-list-row-sub">{c.vm_games?.name} · open the table</div>
              </div>
              <span className="arena-list-row-arrow">→</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
