import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
export default function ProjectRequests({ project, onExpired, onAccepted }) {
  const [requests, setRequests] = useState([]),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('pending');
  const [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [priority, setPriority] = useState('medium'),
    [due, setDue] = useState('');
  const [responses, setResponses] = useState({}),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const endpoint = '/projects/' + project.id + '/requests';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint + '?' + new URLSearchParams({ page: String(page), status }), {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.requests.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setRequests(result.requests);
        setHasMore(result.hasMore);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          if (failure.status === 404) setRequests([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, status, revision, onExpired]);
  async function mutate(data, id) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(endpoint + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(data),
      });
      setRevision((value) => value + 1);
      setNotice(id ? 'Request decision saved.' : 'Work request submitted.');
      if (!id) {
        setTitle('');
        setDescription('');
        setDue('');
        setPriority('medium');
        setPage(1);
      }
      setResponses({});
      if (data.action === 'accept') onAccepted();
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="team-panel" aria-labelledby="requests-heading">
      <h2 id="requests-heading">Propose a next step</h2>
      <p className="small muted">
        Submit work for the project owner to triage before it enters the task board.
        Requests are visible to accepted project members; this is not a public form.
      </p>
      <form
        className="review-request-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutate({ title, description, priority, due });
        }}
      >
        <label>
          Request title
          <input
            required
            maxLength={120}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Request details
          <textarea
            maxLength={1000}
            rows={3}
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Request priority
          <select
            aria-label="Request priority"
            value={priority}
            disabled={busy}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Requested due date
          <input
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={due}
            disabled={busy}
            onChange={(event) => setDue(event.target.value)}
          />
        </label>
        <button className="button" disabled={busy || !title.trim()}>
          Submit work request
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
      <div className="team-toolbar">
        <label>
          Work request status
          <select
            aria-label="Work request status"
            value={status}
            disabled={busy}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="pending">Pending</option>
            <option value="">All requests</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh requests
        </button>
      </div>
      {loading ? (
        <p role="status">Loading requests…</p>
      ) : requests.length ? (
        <ul className="review-list">
          {requests.map((item) => (
            <li key={item.id}>
              <article>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <p className="small muted">
                  From {item.requester?.name ?? 'Former account'} · {item.priority}{' '}
                  priority · {item.due || 'No requested date'} · {item.status}
                </p>
                {item.response && (
                  <p>
                    <strong>Response:</strong> {item.response}
                  </p>
                )}
                {item.status === 'accepting' && (
                  <p role="status">
                    Acceptance is in progress. The owner can retry safely if a save was
                    interrupted.
                  </p>
                )}
                {item.status === 'accepted' && (
                  <p className="small muted">
                    Created on the shared task board. Refresh tasks if needed.
                  </p>
                )}
                {item.canDecide && item.status === 'pending' && (
                  <label>
                    Decision explanation for {item.title}
                    <textarea
                      maxLength={500}
                      rows={2}
                      disabled={busy}
                      value={responses[item.id] ?? ''}
                      onChange={(event) =>
                        setResponses({ ...responses, [item.id]: event.target.value })
                      }
                    />
                  </label>
                )}
                <div className="team-actions">
                  {item.canDecide && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          { action: 'accept', response: responses[item.id] ?? '' },
                          item.id,
                        )
                      }
                    >
                      {item.status === 'accepting'
                        ? 'Retry acceptance'
                        : 'Accept into board'}
                    </button>
                  )}
                  {item.canDecide && item.status === 'pending' && (
                    <button
                      className="secondary"
                      disabled={busy || !(responses[item.id] ?? '').trim()}
                      onClick={() =>
                        mutate(
                          { action: 'decline', response: responses[item.id] ?? '' },
                          item.id,
                        )
                      }
                    >
                      Decline request
                    </button>
                  )}
                  {item.canCancel && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Cancel this work request?'))
                          mutate({ action: 'cancel' }, item.id);
                      }}
                    >
                      Cancel work request
                    </button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No work requests match this view.</p>
      )}
      {(page > 1 || hasMore) && (
        <nav className="pagination" aria-label="Work request pages">
          <button
            className="secondary"
            disabled={busy || loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="secondary"
            disabled={busy || loading || !hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
