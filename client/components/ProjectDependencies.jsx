import { useEffect, useRef, useState } from 'react';
import { request, today } from '../lib/api.js';
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
      {project.role === 'owner' && (
        <DependencySchedule project={project} onExpired={onExpired} />
      )}
    </section>
  );
}

function DependencySchedule({ project, onExpired }) {
  const [date, setDate] = useState(today),
    [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [graphChanged, setGraphChanged] = useState(false);
  const lock = useRef(false),
    endpoint = '/projects/' + project.id + '/schedule';
  async function change(apply) {
    if (lock.current) return;
    if (
      apply &&
      !window.confirm(
        'Apply these proposed due dates? Changed tasks will be skipped. This saves up to 25 dates per batch; earlier saved batches remain if later work conflicts.',
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request(
        endpoint + (apply ? '/' + plan.id + '/apply' : '/preview'),
        {
          method: 'POST',
          body: JSON.stringify(apply ? {} : { startDate: date }),
        },
      );
      setPlan(result.plan);
      setGraphChanged(Boolean(result.graphChanged));
      setNotice(
        apply
          ? 'Schedule batch checked. Review saved dates and conflicts below.'
          : 'Schedule preview ready. Review every proposed date before applying.',
      );
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="automation-panel" aria-labelledby="schedule-heading">
      <h3 id="schedule-heading">Preview dates from task order</h3>
      <p className="small muted">
        Owner-only planning for up to 200 active tasks. Each task uses its planning
        duration (default 1 calendar day), including weekends. Independent tasks can run
        in parallel; completed prerequisites count as satisfied. Repeating tasks stay
        manual. This does not account for holidays, availability or existing due dates.
        Nothing changes until you apply.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          change(false);
        }}
      >
        <label>
          Schedule start date
          <input
            aria-label="Schedule start date"
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            disabled={busy}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPlan(null);
            }}
          />
        </label>
        <button className="secondary" disabled={busy}>
          Preview dependency schedule
        </button>
      </form>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {plan && (
        <>
          <p>
            {plan.pending} dates awaiting review · {plan.conflicts} conflicts · Preview
            expires {new Date(plan.expiresAt).toLocaleString()}
          </p>
          {graphChanged && (
            <p role="alert">
              Dependencies changed during this batch. Saved dates remain. Create and
              review a new preview before continuing.
            </p>
          )}
          <ul className="schedule-preview">
            {plan.rows.map((row) => (
              <li key={row.id}>
                <strong>{row.title}</strong>
                <p className="small">
                  {row.start} → {row.newDue} · Previously: {row.oldDue || 'No due date'} ·{' '}
                  {row.state === 'conflict'
                    ? 'Changed/unavailable — skipped'
                    : row.state === 'saved'
                      ? 'Date saved or already matches'
                      : 'Awaiting review'}
                </p>
              </li>
            ))}
          </ul>
          {plan.pending > 0 && !graphChanged && (
            <button className="button" disabled={busy} onClick={() => change(true)}>
              Apply next schedule batch
            </button>
          )}
          {!plan.rows.length && <p>No eligible unfinished tasks to schedule.</p>}
        </>
      )}
    </section>
  );
}
