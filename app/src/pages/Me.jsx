import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { arenaRecord, changeEmail, listColors, myInvites, myPointsHistory, setLocation, updateMyProfile, uploadAvatarPhoto, SOCIAL_FIELDS, TIER_LABELS } from '../lib/arena.js';
import InvitePanel from '../components/InvitePanel.jsx';
import Avatar from '../components/Avatar.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import ArenaRecord from '../components/ArenaRecord.jsx';

const AVATARS = ['🦊', '🐻', '🐼', '🐸', '🦁', '🐨', '🐯', '🦉', '🐙', '🐢', '🦄', '🐳', '🐺', '🦅', '🐝', '🦋', '🐬', '🦈', '🐲', '🦩', '🦚', '🐧', '🦜', '🐗'];
const STAGES = [
  ['idea', 'I have an idea'], ['building', 'Building'], ['launched', 'Launched'], ['scaling', 'Scaling'], ['exited', 'Exited'], ['investor', 'Investor / advisor'],
];

// Identity (blueprint §7) + the member's own Arena Record. Guests see the
// upgrade path to a free account instead of the editor.
export default function Me({ session, profile, onProfileChanged, onNavigate }) {
  const isGuest = session.user.is_anonymous;
  const [colors, setColors] = useState([]);
  const [record, setRecord] = useState(null);
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState(() => formFrom(profile));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [invites, setInvites] = useState([]);

  useEffect(() => { setForm(formFrom(profile)); }, [profile]);
  useEffect(() => {
    listColors().then(setColors).catch(() => {});
    arenaRecord(session.user.id).then(setRecord).catch(() => {});
    myPointsHistory().then(setPoints).catch(() => {});
    if (!isGuest) myInvites().then(setInvites).catch(() => {});
  }, [session.user.id, isGuest]);

  async function submitEmail(e) {
    e.preventDefault();
    setEmailMsg(null);
    setError(null);
    try {
      await changeEmail(email.trim());
      setEmailMsg(`Check ${email.trim()} for a confirmation link — your email changes once you tap it.`);
      setEmail('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleLocation(on) {
    setError(null);
    setLocBusy(true);
    try {
      if (!on) {
        await setLocation(false);
      } else {
        const pos = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('This browser cannot share location.'));
          navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Location permission was declined — you can still type your city below.')), { timeout: 10000, maximumAge: 600000 });
        });
        // Rounded to ~1 km before it ever leaves the device; others only see a 5 km-rounded distance, and only if they opted in too.
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lng = Math.round(pos.coords.longitude * 100) / 100;
        await setLocation(true, lat, lng, form.city.trim() || null, form.region.trim() || null);
      }
      await onProfileChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setLocBusy(false);
    }
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile(session.user.id, {
        display_name: form.display_name.trim() || 'Player',
        avatar: form.avatar,
        color_ranks: form.color_ranks,
        headline: form.headline.trim() || null,
        business_stage: form.business_stage || null,
        industry: form.industry.trim() || null,
        looking_for: form.looking_for.trim() || null,
        current_project: form.current_project.trim() || null,
        goals: form.goals.trim() || null,
        social_links: Object.fromEntries(Object.entries(form.social_links).map(([k, v]) => [k, normalizeUrl(v)]).filter(([, v]) => v)),
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await onProfileChanged();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Photos need to be under 5 MB.');
      const url = await uploadAvatarPhoto(session.user.id, file);
      await updateMyProfile(session.user.id, { photo_url: url });
      await onProfileChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    setSaving(true);
    try {
      await updateMyProfile(session.user.id, { photo_url: null });
      await onProfileChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const myColor = colors.find((c) => c.key === form.color_ranks[0])?.hex ?? null;

  return (
    <div className="arena-page">
      <div className="arena-page-header">
        <div>
          <h1>Me</h1>
          <p className="subtitle">{isGuest ? 'Guest session' : `${session.user.email} · ${TIER_LABELS[profile?.tier] ?? 'Free'} member`}</p>
        </div>
        <button className="arena-button secondary arena-button-inline" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {error && <div className="arena-error">{error}</div>}

      {isGuest ? (
        <GuestUpgrade onDone={onProfileChanged} />
      ) : (<>
        <form className="arena-panel" onSubmit={save}>
          <div className="va-identity-row">
            <Avatar profile={{ ...profile, avatar: form.avatar }} size={88} color={myColor} />
            <div className="va-identity-actions">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhoto} />
              <button type="button" className="arena-button secondary arena-button-inline" disabled={saving} onClick={() => fileRef.current?.click()}>
                {profile?.photo_url ? 'Change photo' : 'Upload a photo'}
              </button>
              {profile?.photo_url && (
                <button type="button" className="arena-link-button" disabled={saving} onClick={removePhoto}>Use an avatar instead</button>
              )}
            </div>
          </div>

          <label className="arena-label">Display name</label>
          <input className="arena-field" value={form.display_name} maxLength={40} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />

          {!profile?.photo_url && (
            <>
              <label className="arena-label">Avatar</label>
              <div className="va-avatar-grid">
                {AVATARS.map((a) => (
                  <button type="button" key={a} className={`va-avatar-pick ${form.avatar === a ? 'picked' : ''}`} onClick={() => setForm({ ...form, avatar: a })} aria-label={`avatar ${a}`}>{a}</button>
                ))}
              </div>
            </>
          )}

          <label className="arena-label">Your colors at the table</label>
          <ColorPicker colors={colors} ranks={form.color_ranks} onChange={(ranks) => setForm({ ...form, color_ranks: ranks })} />

          <h3 className="va-subhead">Business profile</h3>
          <p className="arena-muted">Used to match you with the right people. Every field is optional.</p>
          <label className="arena-label">Headline</label>
          <input className="arena-field" placeholder="e.g. Building a marketplace for youth sports" value={form.headline} maxLength={120} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
          <label className="arena-label">Stage</label>
          <div className="arena-chip-row">
            {STAGES.map(([key, label]) => (
              <button type="button" key={key} className={`arena-chip ${form.business_stage === key ? 'selected' : ''}`} onClick={() => setForm({ ...form, business_stage: form.business_stage === key ? '' : key })}>{label}</button>
            ))}
          </div>
          <label className="arena-label">Industry</label>
          <input className="arena-field" placeholder="e.g. fintech, consumer, health" value={form.industry} maxLength={60} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <label className="arena-label">Looking for</label>
          <input className="arena-field" placeholder="e.g. a technical co-founder, a mentor, opponents" value={form.looking_for} maxLength={120} onChange={(e) => setForm({ ...form, looking_for: e.target.value })} />

          <label className="arena-label">What you're building right now</label>
          <input className="arena-field" placeholder="e.g. Payflow — invoicing for youth sports clubs, in beta with 12 customers" value={form.current_project} maxLength={200} onChange={(e) => setForm({ ...form, current_project: e.target.value })} />
          <label className="arena-label">Your goals here</label>
          <input className="arena-field" placeholder="e.g. find a technical co-founder, practice negotiating, meet investors" value={form.goals} maxLength={300} onChange={(e) => setForm({ ...form, goals: e.target.value })} />

          <h3 className="va-subhead">Social profiles</h3>
          <p className="arena-muted">Shown on your public Arena Record so people can find you off-platform.</p>
          {SOCIAL_FIELDS.map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="arena-label">{label}</label>
              <input className="arena-field" placeholder={placeholder} value={form.social_links[key] ?? ''} maxLength={200} onChange={(e) => setForm({ ...form, social_links: { ...form.social_links, [key]: e.target.value } })} />
            </div>
          ))}

          <h3 className="va-subhead">Location</h3>
          <p className="arena-muted">Optional. Your city shows on your record only while sharing is on. Distance to other members appears only when <strong>both</strong> of you have turned sharing on, rounded to 5 km — never an exact position.</p>
          <div className="va-inline-2">
            <input className="arena-field" placeholder="City" value={form.city} maxLength={60} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="arena-field" placeholder="State / country" value={form.region} maxLength={60} onChange={(e) => setForm({ ...form, region: e.target.value })} />
          </div>
          <label className="va-switch">
            <input type="checkbox" checked={Boolean(profile?.share_location)} disabled={locBusy} onChange={(e) => toggleLocation(e.target.checked)} />
            <span>{profile?.share_location ? 'Sharing my approximate location with members who also share theirs' : 'Share my approximate location (double opt-in)'}</span>
          </label>

          <button className="arena-button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save profile'}</button>
        </form>

        <form className="arena-panel" onSubmit={submitEmail}>
          <h2>Account email</h2>
          <p className="arena-muted">Currently <strong>{session.user.email}</strong>. Enter a new address and we'll send a confirmation link there.</p>
          {emailMsg && <div className="va-notice">{emailMsg}</div>}
          <div className="arena-inline-form">
            <input className="arena-field" type="email" placeholder="new@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="arena-button secondary arena-button-inline" type="submit" disabled={!email.trim()}>Change email</button>
          </div>
        </form>

        <section className="arena-panel">
          <InvitePanel session={session} />
          {invites.length > 0 && (
            <div className="va-history" style={{ marginTop: 12 }}>
              {invites.map((i) => (
                <div className="va-history-row" key={i.id}>
                  <span className={`va-delta ${i.joined_at ? 'up' : ''}`}>{i.joined_at ? 'joined' : 'sent'}</span>
                  <span className="va-history-game">{i.invitee_name || i.contact || 'a friend'} · via {i.channel}{i.room_code ? ' · to a table' : ''}</span>
                  <span className="arena-muted">{new Date(i.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </>)}

      <section className="arena-panel">
        <div className="arena-panel-header">
          <h2>Arena Record</h2>
          {!isGuest && <button className="arena-button secondary arena-button-inline" onClick={() => onNavigate('member', session.user.id)}>Public view</button>}
        </div>
        <ArenaRecord record={record} colorHex={myColor} />
      </section>

      {!isGuest && points.length > 0 && (
        <section className="arena-panel">
          <h2>Arena Points</h2>
          <div className="va-history">
            {points.map((p) => (
              <div className="va-history-row" key={p.id}>
                <span className="va-delta up">+{p.points}</span>
                <span className="va-history-game">{POINT_LABELS[p.kind] || p.kind}</span>
                <span className="arena-muted">{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function normalizeUrl(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^@/, '')}`;
}

const POINT_LABELS = {
  checkin: 'Daily check-in', quiz: 'Daily quiz', topic_reply: 'Joined the Topic of the Day', game_played: 'Played a game',
  game_won: 'Won a game', challenge_accepted: 'Accepted a challenge', playtest: 'Playtested a Lab game', referral: 'Referral',
};

function formFrom(profile) {
  return {
    display_name: profile?.display_name ?? '',
    avatar: profile?.avatar ?? '🦊',
    color_ranks: profile?.color_ranks ?? [],
    headline: profile?.headline ?? '',
    business_stage: profile?.business_stage ?? '',
    industry: profile?.industry ?? '',
    looking_for: profile?.looking_for ?? '',
    current_project: profile?.current_project ?? '',
    goals: profile?.goals ?? '',
    social_links: profile?.social_links ?? {},
    city: profile?.city ?? '',
    region: profile?.region ?? '',
  };
}

/** Guest → real account without losing the session's rooms and history:
 * Supabase's updateUser on an anonymous user attaches the email/password
 * to the SAME user id (email confirmation may be required). */
function GuestUpgrade({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ email, password, data: { display_name: name || email.split('@')[0] } });
      if (upErr) throw upErr;
      setMsg('Check your inbox to confirm your email — your games and points come with you.');
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="arena-panel" onSubmit={submit}>
      <h2>Keep your progress</h2>
      <p className="arena-muted">You're a guest. Add an email and password to turn this into a free account — your history, streak and points stay with you.</p>
      {error && <div className="arena-error">{error}</div>}
      {msg && <div className="va-notice">{msg}</div>}
      <input className="arena-field" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="arena-field" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="arena-field" type="password" placeholder="Password (6+ characters)" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="arena-button primary" type="submit" disabled={busy}>Create my free account</button>
    </form>
  );
}
