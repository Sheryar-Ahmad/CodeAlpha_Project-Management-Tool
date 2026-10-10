import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';

export function IntakeLinkSettings({ project, onExpired }) {
  const [enabled, setEnabled] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const endpoint = '/projects/' + project.id + '/intake-link';
  useEffect(() => {
    const controller = new AbortController();
    request(endpoint, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setEnabled(result.enabled);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      });
    return () => controller.abort();
  }, [endpoint, onExpired]);
  async function change(action) {
    if (lock.current) return;
    if (
      !window.confirm(
        action === 'disable'
          ? 'Disable this public request link? Previously submitted requests stay available for triage.'
          : 'Create a new public request link? Any previous link will stop accepting requests. Anyone with the new link can submit work.',
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setLink('');
    try {
      const result = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setEnabled(result.enabled);
      if (result.token) setLink(location.origin + '/app.html#request=' + result.token);
    } catch (failure) {
      // A response may be lost after the server rotated the link. Refresh before trying again.
      setEnabled(null);
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="public-link-settings">
      <summary>
        Public request form ·{' '}
        {enabled === null ? 'Check settings' : enabled ? 'Enabled' : 'Disabled'}
      </summary>
      <p>
        Share a link with people who need to propose work. It shows the project name and a
        submission form. Requests remain private to your team until you decide what
        becomes a task.
      </p>
      <p>
        Names are unverified. Avoid collecting passwords, private documents or sensitive
        personal information. The link is shown once; create a new one if you lose it.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="team-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => change('rotate')}
        >
          {enabled ? 'Replace public request link' : 'Create public request link'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || enabled === false}
          onClick={() => change('disable')}
        >
          Disable public request link
        </button>
      </div>
      {link && (
        <label>
          Public request link
          <input readOnly value={link} onFocus={(event) => event.target.select()} />
        </label>
      )}
    </details>
  );
}

export default function PublicRequest({ token }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState({
    submitter: '',
    title: '',
    description: '',
    due: '',
    website: '',
  });
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const headers = { 'X-Orbit-Intake': token };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request('/intake', {
      signal: controller.signal,
      headers: { 'X-Orbit-Intake': token },
      credentials: 'omit',
    })
      .then((result) => {
        if (!controller.signal.aborted) setProject(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setProject(null);
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, revision]);
  async function submit(event) {
    event.preventDefault();
    if (lock.current || notice) return;
    lock.current = true;
    setBusy(true);
    setStarted(true);
    setError('');
    try {
      const result = await request('/intake', {
        method: 'POST',
        credentials: 'omit',
        headers,
        body: JSON.stringify({ ...draft, key: key.current }),
      });
      setNotice(result.message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function newRequest() {
    if (
      started &&
      !notice &&
      !window.confirm(
        'Start a separate request? Your previous submission may already have been received. Retry first to avoid duplicates.',
      )
    )
      return;
    key.current = crypto.randomUUID();
    setStarted(false);
    setNotice('');
    setError('');
    setDraft({ submitter: '', title: '', description: '', due: '', website: '' });
  }
  const field = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  return (
    <main className="public-request-page">
      <header>
        <a className="brand" href="/">
          orbit<span>.</span>
        </a>
        <a href="privacy.html">Privacy & data</a>
      </header>
      <section className="team-panel" aria-labelledby="public-request-heading">
        <p className="eyebrow">A clear next step</p>
        <h1 id="public-request-heading">
          {project ? 'Propose work for ' + project.name : 'Project request form'}
        </h1>
        {loading && <p role="status">Opening request form…</p>}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {!project && !loading && (
          <button className="secondary" onClick={() => setRevision((value) => value + 1)}>
            Try opening form again
          </button>
        )}
        {project && (
          <>
            <p>
              No account required. Your request goes to the project team for review.
              Submitting does not automatically add a task.
            </p>
            <p className="muted">
              Use a name or alias the team recognizes. Keep sensitive personal information
              out of this form. No email address is collected and no response email is
              sent.
            </p>
            {notice ? (
              <div role="status">
                <h2>Thank you for the next step</h2>
                <p>{notice}</p>
              </div>
            ) : (
              <form className="review-request-form" onSubmit={submit}>
                <label>
                  Your name or alias
                  <input
                    required
                    maxLength={60}
                    value={draft.submitter}
                    disabled={busy || started}
                    onChange={(event) => field('submitter', event.target.value)}
                  />
                </label>
                <label>
                  What needs to be done?
                  <input
                    required
                    maxLength={120}
                    value={draft.title}
                    disabled={busy || started}
                    onChange={(event) => field('title', event.target.value)}
                  />
                </label>
                <label>
                  Useful context
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={draft.description}
                    disabled={busy || started}
                    onChange={(event) => field('description', event.target.value)}
                  />
                </label>
                <label>
                  Preferred date (optional)
                  <input
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={draft.due}
                    disabled={busy || started}
                    onChange={(event) => field('due', event.target.value)}
                  />
                </label>
                <div className="intake-honeypot" aria-hidden="true">
                  <label>
                    Leave this field blank
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={draft.website}
                      onChange={(event) => field('website', event.target.value)}
                    />
                  </label>
                </div>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? 'Sending…' : started ? 'Retry same request' : 'Send request'}
                </button>
              </form>
            )}
            {started && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={newRequest}
              >
                {notice ? 'Send another request' : 'Start a separate request'}
              </button>
            )}
          </>
        )}
      </section>
      <footer>
        <a href="/">About Orbit</a>
        <span>Work requests are reviewed by the project owner.</span>
      </footer>
    </main>
  );
}
