import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
export default function ProjectDependencies({ project, tasks, onExpired }) {
  const [edges, setEdges] = useState([]),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    endpoint = '/projects/' + project.id + '/dependencies';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setEdges(result.edges);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          if (failure.status === 404) setEdges([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, revision, onExpired]);
  async function change(edge, remove) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(endpoint, {
        method: remove ? 'DELETE' : 'POST',
        body: JSON.stringify(edge),
      });
      setRevision((value) => value + 1);
      setNotice(remove ? 'Dependency removed.' : 'Dependency added.');
      if (!remove) {
        setFrom('');
        setTo('');
      }
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const active = tasks.filter((task) => task.lifecycle === 'active');
  return (
    <section className="team-panel" aria-labelledby="dependencies-heading">
      <h2 id="dependencies-heading">What needs to happen first?</h2>
      <p className="small muted">
        Record prerequisites between tasks. Choose active tasks on this page; all project
        dependencies appear below. Links do not automatically change dates or task status.
      </p>
      <form
        className="dependency-form"
        onSubmit={(event) => {
          event.preventDefault();
          change({ from, to }, false);
        }}
      >
        <label>
          Finish this first
          <select
            aria-label="Finish this first"
            required
            value={from}
            disabled={busy}
            onChange={(event) => setFrom(event.target.value)}
          >
            <option value="">Choose a prerequisite</option>
            {active.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Before starting this
          <select
            aria-label="Before starting this"
            required
            value={to}
            disabled={busy}
            onChange={(event) => setTo(event.target.value)}
          >
            <option value="">Choose the dependent task</option>
            {active.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={busy || !from || !to || from === to}>
          Add dependency
        </button>
      </form>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <button
        className="text-button"
        disabled={busy || loading}
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh dependencies
      </button>
      {loading ? (
        <p role="status">Loading dependencies…</p>
      ) : edges.length ? (
        <ul className="dependency-list">
          {edges.map((edge) => (
            <li key={edge.from + ':' + edge.to}>
              <div>
                <strong>{edge.predecessor?.title ?? 'Task unavailable'}</strong>
                <span aria-hidden="true"> → </span>
                <strong>{edge.dependent?.title ?? 'Task unavailable'}</strong>
                <p className="small muted">
                  {!edge.predecessor || !edge.dependent
                    ? 'A task was moved, trashed, or deleted. Remove this link if it no longer applies.'
                    : edge.predecessor.status === 'done'
                      ? 'Prerequisite complete'
                      : 'Waiting for prerequisite completion'}
                </p>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm('Remove this dependency link? Tasks will stay saved.')
                  )
                    change({ from: edge.from, to: edge.to }, true);
                }}
              >
                Remove link
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No dependencies yet. Link work when its order matters.</p>
      )}
    </section>
  );
}
