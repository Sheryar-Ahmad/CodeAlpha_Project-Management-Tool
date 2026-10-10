import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
import { resultProgress } from '../../shared/goals.js';
function GoalForm({ goal, busy, onSave, onCancel }) {
  const [results, setResults] = useState(
    goal?.results ?? [
      {
        id: crypto.randomUUID(),
        title: '',
        unit: '',
        baseline: 0,
        current: 0,
        target: 1,
      },
    ],
  );
  const update = (id, key, value) =>
    setResults((items) =>
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        onSave(
          {
            title: data.title,
            due: data.due,
            results: results.map((item) => ({
              ...item,
              baseline: Number(item.baseline),
              current: Number(item.current),
              target: Number(item.target),
            })),
            ...(goal ? { revision: goal.revision } : {}),
          },
          goal?.id,
        );
      }}
    >
      <fieldset disabled={busy}>
        <legend>{goal ? 'Edit objective' : 'New objective'}</legend>
        <label>
          Objective
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={goal?.title}
            placeholder="e.g. Deliver a useful community workshop"
          />
        </label>
        <label>
          Goal due date
          <input
            name="due"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            defaultValue={goal?.due}
          />
        </label>
        <p className="small muted">
          Add up to 8 measurable results. Progress is the equal-weight average of results,
          bounded to 0–100%; decreasing targets are supported.
        </p>
        {results.map((item, index) => (
          <fieldset className="goal-result-editor" key={item.id}>
            <legend>Result {index + 1}</legend>
            <label>
              Result title
              <input
                aria-label={'Result title ' + (index + 1)}
                required
                maxLength={120}
                value={item.title}
                onChange={(event) => update(item.id, 'title', event.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                maxLength={30}
                placeholder="e.g. participants"
                value={item.unit}
                onChange={(event) => update(item.id, 'unit', event.target.value)}
              />
            </label>
            <div className="form-row">
              {['baseline', 'current', 'target'].map((key) => (
                <label key={key}>
                  {key[0].toUpperCase() + key.slice(1)}
                  <input
                    aria-label={key + ' result ' + (index + 1)}
                    type="number"
                    required
                    min="-1000000000"
                    max="1000000000"
                    step="any"
                    value={item[key]}
                    onChange={(event) => update(item.id, key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <button
              className="text-button"
              type="button"
              disabled={results.length <= 1}
              onClick={() =>
                setResults((items) => items.filter((result) => result.id !== item.id))
              }
            >
              Remove result {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          className="secondary"
          type="button"
          disabled={results.length >= 8}
          onClick={() =>
            setResults((items) => [
              ...items,
              {
                id: crypto.randomUUID(),
                title: '',
                unit: '',
                baseline: 0,
                current: 0,
                target: 1,
              },
            ])
          }
        >
          Add measurable result
        </button>
        <div className="dialog-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel objective
          </button>
          <button className="button">Save objective</button>
        </div>
      </fieldset>
    </form>
  );
}
export default function ProjectGoals({ project, onExpired }) {
  const [goals, setGoals] = useState([]),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const [editor, setEditor] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    endpoint = '/projects/' + project.id + '/goals';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint + '?page=' + page, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setGoals(result.goals);
          setHasMore(result.hasMore);
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          if (failure.status === 404) {
            setGoals([]);
            setEditor(null);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, revision, onExpired]);
  async function mutate(body, id, remove = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(endpoint + (id ? '/' + id : ''), {
        method: remove ? 'DELETE' : id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      setEditor(null);
      setRevision((value) => value + 1);
      setNotice(remove ? 'Objective removed.' : 'Objective saved.');
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="team-panel" aria-labelledby="goals-heading">
      <h2 id="goals-heading">Connect work to a clear outcome</h2>
      <p className="small muted">
        Keep objectives and measurable results in view. Members edit their own objectives;
        the owner can edit any. Results are entered manually and do not automatically
        change tasks.
      </p>
      <div className="template-controls">
        <button
          className="button"
          disabled={busy || loading || Boolean(editor)}
          onClick={() => setEditor({ goal: null })}
        >
          New objective
        </button>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => {
            setEditor(null);
            setRevision((value) => value + 1);
          }}
        >
          Refresh objectives
        </button>
      </div>
      {editor && (
        <GoalForm
          key={editor.goal?.id ?? 'new'}
          goal={editor.goal}
          busy={busy}
          onSave={mutate}
          onCancel={() => setEditor(null)}
        />
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {loading ? (
        <p role="status">Loading objectives…</p>
      ) : goals.length ? (
        <ul className="goal-list">
          {goals.map((goal) => (
            <li key={goal.id}>
              <h3>{goal.title}</h3>
              <p>
                Due: {goal.due || 'Not set'} · {goal.progress}% progress
              </p>
              <progress
                max="100"
                value={goal.progress}
                aria-label={'Progress for ' + goal.title}
              />
              <ul>
                {goal.results.map((result) => (
                  <li key={result.id}>
                    <strong>{result.title}</strong>
                    <p className="small">
                      {result.baseline} → {result.current} of {result.target}{' '}
                      {result.unit} · {resultProgress(result)}%
                    </p>
                  </li>
                ))}
              </ul>
              {goal.canEdit && (
                <div className="template-controls">
                  <button
                    className="secondary"
                    disabled={busy || Boolean(editor)}
                    onClick={() => setEditor({ goal })}
                  >
                    Edit {goal.title}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this objective and its results? Tasks stay saved.',
                        )
                      )
                        mutate({ revision: goal.revision }, goal.id, true);
                    }}
                  >
                    Remove {goal.title}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">
          No objectives yet. Set an outcome that matters to this project.
        </p>
      )}
      {(page > 1 || hasMore) && (
        <nav className="pagination" aria-label="Objective pages">
          <button
            className="secondary"
            disabled={busy || loading || page === 1}
            onClick={() => {
              setEditor(null);
              setPage((value) => value - 1);
            }}
          >
            Previous objectives
          </button>
          <span>Page {page}</span>
          <button
            className="secondary"
            disabled={busy || loading || !hasMore}
            onClick={() => {
              setEditor(null);
              setPage((value) => value + 1);
            }}
          >
            Next objectives
          </button>
        </nav>
      )}
    </section>
  );
}
