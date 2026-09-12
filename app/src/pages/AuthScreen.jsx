import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { storedReferral, signInWith, OAUTH_PROVIDERS } from '../lib/arena.js';

// Real accounts (email/password) and guests (Supabase anonymous sign-in)
// both land the user in the same LobbyPlaceholder afterwards — see
// App.jsx. A guest who later wants to keep their progress can link a real
// email/password onto the SAME user via supabase.auth.updateUser() /
// linkIdentity(), which is intentionally not wired up in this foundation
// pass; see README.md's "Next up" section.
export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName || email.split('@')[0] } },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider) {
    setError(null);
    setBusy(true);
    try {
      await signInWith(provider);
    } catch (err) {
      setError(`${err.message} — this sign-in method may not be switched on yet; use email for now.`);
      setBusy(false);
    }
  }

  async function handleGuest() {
    setError(null);
    setBusy(true);
    try {
      const { error: guestError } = await supabase.auth.signInAnonymously();
      if (guestError) throw guestError;
    } catch (err) {
      setError(err.message || 'Could not start a guest session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="arena-shell">
      <h1>Get in the game</h1>
      {storedReferral() && <div className="va-notice">You were invited by a friend — create a free account and you'll be connected automatically.</div>}
      <p className="subtitle">Play business games with founders and friends. Every game reads your style and matches you with the right people. Jump in as a guest or create a free account to keep your record.</p>

      {error && <div className="arena-error">{error}</div>}

      <div className="va-auth-paths">
        <button className="arena-button secondary" onClick={handleGuest} disabled={busy}>
          <strong>Just play once</strong><span className="va-auth-sub">No account, no questions. One game as a guest.</span>
        </button>
      </div>
      <div className="va-auth-divider"><span>or create a free account — keep your stats, meet people</span></div>
      <div className="va-oauth-row">
        {OAUTH_PROVIDERS.map(([key, label]) => (
          <button key={key} type="button" className="arena-button secondary arena-button-inline" disabled={busy} onClick={() => handleOAuth(key)}>Continue with {label}</button>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <input
            className="arena-field"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
        <input
          className="arena-field"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="arena-field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button className="arena-button primary" type="submit" disabled={busy}>
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>


      <div className="arena-switch">
        {mode === 'signin' ? (
          <>
            New here? <a onClick={() => setMode('signup')}>Create an account</a>
          </>
        ) : (
          <>
            Already have an account? <a onClick={() => setMode('signin')}>Sign in</a>
          </>
        )}
      </div>
    </div>
  );
}
