import { useEffect, useState } from 'react';
import { finishOnboarding, listColors, recomputeSurvey, updateMyProfile } from '../lib/arena.js';
import Avatar from '../components/Avatar.jsx';
import ColorPicker from '../components/ColorPicker.jsx';

// Guided setup on first sign-in with a real account. Four short steps, every
// field skippable, and each completed section earns points (50 at half,
// 100 at 80%, 150 at 100% — contact info is required for membership but
// never scored). "Skip for now" lands the member in the Arena at any time.
const AVATARS = ['🦊', '🐻', '🐼', '🐸', '🦁', '🐨', '🐯', '🦉', '🐙', '🐢', '🦄', '🐳', '🐺', '🦅', '🐝', '🦋', '🐬', '🦈', '🐲', '🦩', '🦚', '🐧', '🦜', '🐗'];
const STAGES = [['idea', 'I have an idea'], ['building', 'Building'], ['launched', 'Launched'], ['scaling', 'Scaling'], ['exited', 'Exited'], ['investor', 'Investor / advisor']];
const STEPS = ['You at the table', 'Your business', 'What you want here', 'How to reach you'];

export default function Onboarding({ session, profile, onDone }) {
  const [step, setStep] = useState(0);
  const [colors, setColors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bonus, setBonus] = useState(0);
  const [form, setForm] = useState({
    display_name: profile?.display_name && !['Player', 'Guest'].includes(profile.display_name) ? profile.display_name : '',
    avatar: profile?.avatar ?? '🦊',
    color_ranks: profile?.color_ranks ?? [],
    headline: profile?.headline ?? '',
    business_stage: profile?.business_stage ?? '',
    industry: profile?.industry ?? '',
    current_project: profile?.current_project ?? '',
    looking_for: profile?.looking_for ?? '',
    goals: profile?.goals ?? '',
    skills: (profile?.skills ?? []).join(', '),
    phone: profile?.phone ?? '',
  });

  useEffect(() => { listColors().then(setColors).catch(() => {}); }, []);

  async function saveStep() {
    setBusy(true);
    setError(null);
    try {
      await updateMyProfile(session.user.id, {
        display_name: form.display_name.trim() || profile?.display_name || 'Player',
        avatar: form.avatar,
        color_ranks: form.color_ranks,
        headline: form.headline.trim() || null,
        business_stage: form.business_stage || null,
        industry: form.industry.trim() || null,
        current_project: form.current_project.trim() || null,
        looking_for: form.looking_for.trim() || null,
        goals: form.goals.trim() || null,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
        phone: form.phone.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const r = await recomputeSurvey();
      if (r?.bonus_awarded) setBonus((b) => b + r.bonus_awarded);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!(await saveStep())) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else await finish();
  }

  async function finish() {
    setBusy(true);
    try {
      await finishOnboarding();
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  async function skipAll() {
    await saveStep();
    await finish();
  }

  const myColor = colors.find((c) => c.key === form.color_ranks[0])?.hex ?? null;

  return (
    <div className="arena-page va-onboard">
      <div className="va-onboard-head">
        <p className="va-eyebrow">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        <div className="va-progress"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        {bonus > 0 && <div className="va-notice">+{bonus} Arena Points earned so far for filling in your profile.</div>}
      </div>
      {error && <div className="arena-error">{error}</div>}

      {step === 0 && (
        <section className="arena-panel">
          <h2>How you show up at the table</h2>
          <div className="va-identity-row"><Avatar profile={{ ...profile, avatar: form.avatar }} size={72} color={myColor} /><p className="arena-muted">Pick a name, an avatar and your colors. You can upload a photo later on the Me tab.</p></div>
          <label className="arena-label">Display name</label>
          <input className="arena-field" value={form.display_name} maxLength={40} placeholder="What should people call you?" onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <label className="arena-label">Avatar</label>
          <div className="va-avatar-grid">
            {AVATARS.map((a) => <button type="button" key={a} className={`va-avatar-pick ${form.avatar === a ? 'picked' : ''}`} onClick={() => setForm({ ...form, avatar: a })} aria-label={`avatar ${a}`}>{a}</button>)}
          </div>
          <label className="arena-label">Your colors (first choice, then fallbacks)</label>
          <ColorPicker colors={colors} ranks={form.color_ranks} onChange={(ranks) => setForm({ ...form, color_ranks: ranks })} />
        </section>
      )}

      {step === 1 && (
        <section className="arena-panel">
          <h2>Your business</h2>
          <p className="arena-muted">This is what we match on. Each answer is worth points.</p>
          <label className="arena-label">One line about you</label>
          <input className="arena-field" placeholder="e.g. Second-time founder, B2B payments" value={form.headline} maxLength={120} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
          <label className="arena-label">Stage</label>
          <div className="arena-chip-row">
            {STAGES.map(([key, label]) => <button type="button" key={key} className={`arena-chip ${form.business_stage === key ? 'selected' : ''}`} onClick={() => setForm({ ...form, business_stage: form.business_stage === key ? '' : key })}>{label}</button>)}
          </div>
          <label className="arena-label">Industry</label>
          <input className="arena-field" placeholder="e.g. fintech, consumer, health" value={form.industry} maxLength={60} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <label className="arena-label">What you're building right now</label>
          <input className="arena-field" placeholder="Project or company, in a sentence" value={form.current_project} maxLength={200} onChange={(e) => setForm({ ...form, current_project: e.target.value })} />
          <label className="arena-label">Skills you bring (comma separated)</label>
          <input className="arena-field" placeholder="e.g. sales, product, react, fundraising" value={form.skills} maxLength={200} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
        </section>
      )}

      {step === 2 && (
        <section className="arena-panel">
          <h2>What you want from the Arena</h2>
          <label className="arena-label">Goals</label>
          <input className="arena-field" placeholder="e.g. practice negotiating, meet investors, find a co-founder" value={form.goals} maxLength={300} onChange={(e) => setForm({ ...form, goals: e.target.value })} />
          <label className="arena-label">Who you're looking for</label>
          <input className="arena-field" placeholder="e.g. a technical co-founder, a mentor who has sold a company, tough opponents" value={form.looking_for} maxLength={120} onChange={(e) => setForm({ ...form, looking_for: e.target.value })} />
        </section>
      )}

      {step === 3 && (
        <section className="arena-panel">
          <h2>How to reach you</h2>
          <p className="arena-muted">Your email <strong>{session.user.email}</strong> is on file{profile?.email_verified ? ' and verified' : ' — confirm it from your inbox to keep your stats'}. A phone number is optional and never shown to other members; it's for game invites and, if you choose a paid plan later, coaching and event reminders.</p>
          <label className="arena-label">Mobile number (optional)</label>
          <input className="arena-field" type="tel" placeholder="+1 555 010 2233" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <p className="arena-muted">Contact details earn no points — everything else you filled in already did.</p>
        </section>
      )}

      <div className="va-onboard-actions">
        {step > 0 && <button className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        <button className="arena-button primary arena-button-inline" disabled={busy} onClick={next}>{step === STEPS.length - 1 ? 'Enter the Arena' : 'Next'}</button>
        <button className="arena-link-button" disabled={busy} onClick={skipAll}>Skip for now</button>
      </div>
    </div>
  );
}
