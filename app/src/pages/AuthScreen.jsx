import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

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
      <p className="subtitle">Play VentureMaker games with friends — or jump in as a guest.</p>

      {error && <div className="arena-error">{error}</div>}

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

      <button className="arena-button secondary" onClick={handleGuest} disabled={busy}>
        Continue as guest
      </button>

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
