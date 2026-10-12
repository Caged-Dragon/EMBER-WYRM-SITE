import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth, type AuthMode } from './context';
import { isUsernameTaken } from './api';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

const TITLES: Record<AuthMode, string> = {
  signin: 'Welcome back, dragon',
  signup: 'Join the Realm',
  reset: 'Reset your password',
  recovery: 'Choose a new password',
};

export function AuthModal() {
  const { authOpen, authMode, setAuthMode, closeAuth, signIn, signUp, resetPassword, updatePassword } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Games listen for keys on window (WASD, Space, P…). Keep typing inside the form from leaking out.
  useEffect(() => {
    const el = rootRef.current;
    if (!authOpen || !el) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') closeAuth();
    };
    el.addEventListener('keydown', onKey);
    el.addEventListener('keyup', onKey);
    el.addEventListener('keypress', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('keyup', onKey);
      el.removeEventListener('keypress', onKey);
    };
  }, [authOpen, closeAuth]);

  useEffect(() => {
    if (authOpen) {
      setError(null);
      setInfo(null);
      setPassword('');
    }
  }, [authOpen, authMode]);

  if (!authOpen) return null;

  const switchMode = (m: AuthMode) => {
    setAuthMode(m);
    setError(null);
    setInfo(null);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const mail = email.trim();

    if (authMode === 'recovery') {
      if (password.length < 8) return setError('Use at least 8 characters.');
      setBusy(true);
      const err = await updatePassword(password);
      setBusy(false);
      if (err) return setError(err);
      return closeAuth();
    }

    if (!mail) return setError('Enter your email.');

    if (authMode === 'reset') {
      setBusy(true);
      const err = await resetPassword(mail);
      setBusy(false);
      if (err) return setError(err);
      return setInfo('If that email has an account, a reset link is on its way.');
    }

    if (password.length < 8) return setError('Use at least 8 characters for your password.');

    if (authMode === 'signin') {
      setBusy(true);
      const err = await signIn(mail, password);
      setBusy(false);
      if (err) return setError(err);
      return closeAuth();
    }

    // signup
    const name = username.trim();
    if (!USERNAME_RE.test(name)) return setError('Username: 3–20 letters, numbers or underscores.');
    setBusy(true);
    if (await isUsernameTaken(name)) {
      setBusy(false);
      return setError('That username is already taken.');
    }
    const res = await signUp(mail, password, name);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.needsConfirm) {
      setAuthMode('signin');
      return setInfo('Account created! Check your email to confirm it, then sign in.');
    }
    closeAuth();
  }

  const showTabs = authMode === 'signin' || authMode === 'signup';

  return (
    <div
      ref={rootRef}
      className="dps-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[authMode]}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAuth();
      }}
    >
      <div className="dps-card">
        <button type="button" className="dps-x" aria-label="Close" onClick={closeAuth}>
          ×
        </button>
        <div className="dps-flame" aria-hidden>🔥</div>
        <h2 className="dps-title">{TITLES[authMode]}</h2>
        <p className="dps-sub">One account for every game in the Dragon Realm — scores, saves and favorites follow you.</p>

        {showTabs && (
          <div className="dps-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={authMode === 'signin'} className={authMode === 'signin' ? 'on' : ''} onClick={() => switchMode('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={authMode === 'signup'} className={authMode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>
              Create account
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="dps-form" noValidate>
          {authMode === 'signup' && (
            <label>
              <span>Username</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={20} placeholder="DragonRider" />
            </label>
          )}
          {authMode !== 'recovery' && (
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
            </label>
          )}
          {authMode !== 'reset' && (
            <label>
              <span>{authMode === 'recovery' ? 'New password' : 'Password'}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="At least 8 characters"
              />
            </label>
          )}

          {error && <p className="dps-msg dps-err" role="alert">{error}</p>}
          {info && <p className="dps-msg dps-ok" role="status">{info}</p>}

          <button type="submit" className="dps-primary" disabled={busy}>
            {busy ? 'One moment…' : authMode === 'signin' ? 'Sign in' : authMode === 'signup' ? 'Create account' : authMode === 'reset' ? 'Send reset link' : 'Save new password'}
          </button>
        </form>

        <div className="dps-links">
          {authMode === 'signin' && (
            <button type="button" onClick={() => switchMode('reset')}>Forgot password?</button>
          )}
          {authMode === 'reset' && (
            <button type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
          <button type="button" onClick={closeAuth}>Continue as guest</button>
        </div>
      </div>
    </div>
  );
}
