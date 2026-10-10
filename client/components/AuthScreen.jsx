import { useState } from 'react';
import { ArrowUpRight, Layers3, LockKeyhole, ArrowLeft } from 'lucide-react';
import { request } from '../lib/api.js';

export default function AuthScreen({
  onUser,
  onDemo,
  initialError,
  initialRegister = false,
}) {
  const [register, setRegister] = useState(initialRegister);
  const [recover, setRecover] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request(
        recover ? '/auth/recover' : register ? '/auth/register' : '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      if (recover) {
        setRecover(false);
        setNotice(result.message);
      } else onUser(result.user);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="logo" aria-hidden="true">
            ◈
          </span>{' '}
          orbit.
        </a>
        <div>
          <p className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
          <h1>
            Your next big idea.
            <br />
            One clear workspace.
          </h1>
          <p>
            Bring tasks, priorities, and deadlines together. Make room for the work that
            matters.
          </p>
          <div className="auth-milestone">
            <Layers3 size={22} />
            <span>Plan it. Move it. Finish it.</span>
          </div>
        </div>
        <a href="/" className="back-link">
          <ArrowLeft size={15} /> Back to Orbit
        </a>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <span className="feature-icon">
          <LockKeyhole size={22} />
        </span>
        <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
        <h2 id="auth-title">
          {recover
            ? 'Recover your workspace.'
            : register
              ? 'Start something great.'
              : 'Welcome back.'}
        </h2>
        <p className="muted">
          {recover
            ? 'Use the one-time recovery code you saved from Account settings.'
            : register
              ? 'Create an account to save your work across devices.'
              : 'Sign in and pick up where you left off.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={60}
                disabled={busy}
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={busy}
            />
          </label>
          {recover && (
            <label>
              Recovery code
              <input
                name="code"
                aria-label="Recovery code"
                required
                minLength={64}
                maxLength={64}
                autoComplete="off"
                disabled={busy}
              />
            </label>
          )}
          <label>
            {recover ? 'New password' : 'Password'}
            <input
              name="password"
              type="password"
              autoComplete={register || recover ? 'new-password' : 'current-password'}
              required
              minLength={register || recover ? 12 : 1}
              maxLength={128}
              disabled={busy}
            />
          </label>
          {register && (
            <p className="small muted">
              Use at least 12 characters. A long passphrase works well.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button auth-submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : recover
                ? 'Reset password'
                : register
                  ? 'Create account'
                  : 'Sign in'}{' '}
            <ArrowUpRight size={16} />
          </button>
        </form>
        <button
          className="text-button auth-switch"
          disabled={busy}
          onClick={() => {
            setRecover(false);
            setNotice('');
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        {!register && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setRecover((value) => !value);
              setError('');
              setNotice('');
            }}
          >
            {recover ? 'Back to sign in' : 'Forgot password? Use a recovery code'}
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="auth-divider">
          <span>or explore first</span>
        </div>
        <button className="secondary auth-submit" disabled={busy} onClick={onDemo}>
          Open the local demo
        </button>
        <p className="small muted">
          Demo tasks stay in this browser. Accounts use MongoDB storage.{' '}
          <a href="/privacy.html">Privacy &amp; data</a>
        </p>
      </section>
    </main>
  );
}
