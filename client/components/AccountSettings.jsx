import { useRef, useState } from 'react';
import useModal from '../hooks/useModal.js';
import { request } from '../lib/api.js';
export default function AccountSettings({ onClose, onExpired, onDeleted, onDeleting }) {
  const ref = useRef(null),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [code, setCode] = useState('');
  useModal(ref);
  async function submit(event, endpoint) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setCode('');
    const form = event.currentTarget,
      data = Object.fromEntries(new FormData(form));
    try {
      const result = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result.code) {
        setCode(result.code);
        setNotice(
          'Save this code privately. It appears only now; generating another invalidates it.',
        );
      } else setNotice(result.message);
      form.reset();
    } catch (failure) {
      if (failure.status === 401 && failure.message !== 'Current password is incorrect.')
        onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="account-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="account-heading">Keep your account in your hands</h2>
      <p className="small muted">
        Save a one-time recovery code in a password manager or another private place. It
        can reset your password without email. If you lose both your password and saved
        code, this recovery method cannot restore access.
      </p>
      <form onSubmit={(event) => submit(event, '/auth/recovery-code')}>
        <fieldset disabled={busy}>
          <legend>Recovery code</legend>
          <label>
            Current password for recovery
            <input
              aria-label="Current password for recovery"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <button className="secondary">Generate recovery code</button>
        </fieldset>
      </form>
      {code && (
        <label>
          Your new recovery code
          <textarea
            aria-label="Your new recovery code"
            readOnly
            rows={3}
            value={code}
            autoComplete="off"
          />
          <span className="small muted">
            Treat this like a password. It is never saved in browser storage or logs.
          </span>
        </label>
      )}
      <form onSubmit={(event) => submit(event, '/auth/password')}>
        <fieldset disabled={busy}>
          <legend>Change password</legend>
          <label>
            Current password
            <input
              aria-label="Current password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            New account password
            <input
              aria-label="New account password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <button className="secondary">Update password</button>
          <p className="small muted">
            Changing your password signs out other sessions and invalidates the old
            recovery code.
          </p>
        </fieldset>
      </form>
      <AccountDeletionForm
        disabled={busy}
        onBusy={setBusy}
        onExpired={onExpired}
        onDeleted={onDeleted}
        onDeleting={onDeleting}
      />
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      <div className="dialog-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Close account settings
        </button>
      </div>
    </dialog>
  );
}

function AccountDeletionForm({
  disabled = false,
  onBusy = () => {},
  onDeleted,
  onDeleting,
  onExpired,
  started = false,
}) {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (lock.current || disabled) return;
    if (
      !started &&
      !window.confirm(
        'Permanently remove your account and ALL owned projects, including shared projects? This cannot be undone. Export any task backup first.',
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const result = await request('/account', {
        method: 'DELETE',
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      if (result) onDeleting();
      else onDeleted();
    } catch (failure) {
      if (failure.status === 401 && failure.message !== 'Current password is incorrect.')
        onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="account-delete-form" onSubmit={submit}>
      <fieldset disabled={disabled || busy}>
        <legend>{started ? 'Finish account deletion' : 'Delete account'}</legend>
        <p className="small">
          This permanently removes your owned tasks and projects, including shared
          projects and their team content, plus your notes, logs, memberships and
          contributions to other projects. Other people lose access to your owned
          projects. Export a backup first. This cannot be undone.
        </p>
        <label>
          Password to delete account
          <input
            aria-label="Password to delete account"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          Type DELETE to confirm
          <input
            aria-label="Type DELETE to confirm"
            name="confirmation"
            autoComplete="off"
            pattern="DELETE"
            required
          />
        </label>
        <button className="secondary" disabled={disabled || busy}>
          {busy
            ? 'Removing account data…'
            : started
              ? 'Continue deletion'
              : 'Permanently delete account'}
        </button>
      </fieldset>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function AccountDeletionScreen({ onDeleted, onExpired }) {
  return (
    <main className="deletion-screen">
      <a className="brand" href="/">
        orbit.
      </a>
      <h1>Finish removing your account</h1>
      <p>
        Your account is frozen while deletion is in progress. Continue below; the daily
        maintenance job can also finish cleanup when configured. If a request fails,
        retrying is safe.
      </p>
      <AccountDeletionForm
        started
        onExpired={onExpired}
        onDeleted={onDeleted}
        onDeleting={() => {}}
      />
    </main>
  );
}
