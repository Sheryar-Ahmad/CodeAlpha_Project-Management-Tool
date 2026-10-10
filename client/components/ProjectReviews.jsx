import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
// Reviews record a frozen title/description and never silently change a task's status.
export default function ProjectReviews({ project, directory, tasks, onExpired }) {
  const [reviews, setReviews] = useState([]),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('pending');
  const [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [task, setTask] = useState(''),
    [reviewer, setReviewer] = useState(''),
    [message, setMessage] = useState('');
  const [responses, setResponses] = useState({}),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const endpoint = '/projects/' + project.id + '/reviews';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint + '?' + new URLSearchParams({ page: String(page), status }), {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.reviews.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setReviews(result.reviews);
        setHasMore(result.hasMore);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          if (failure.status === 404) setReviews([]);
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
      setNotice(id ? 'Review decision saved.' : 'Review requested.');
      if (!id) {
        setTask('');
        setReviewer('');
        setMessage('');
        setPage(1);
      }
      setResponses({});
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="team-panel" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Review requests</h2>
      <p className="small muted">
        Record feedback on the task title and description captured when requested. Later
        task edits do not update that snapshot. An approval does not mark the task
        complete or lock its edits.
      </p>
      <form
        className="review-request-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutate({ task, reviewer, message });
        }}
      >
        <label>
          Task to review
          <select
            aria-label="Task to review"
            required
            value={task}
            disabled={busy}
            onChange={(event) => setTask(event.target.value)}
          >
            <option value="">Choose an active task on this page</option>
            {tasks
              .filter((item) => item.lifecycle === 'active')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Reviewer
          <select
            aria-label="Reviewer"
            required
            value={reviewer}
            disabled={busy}
            onChange={(event) => setReviewer(event.target.value)}
          >
            <option value="">Choose another project member</option>
            {directory.owner && (
              <option value={directory.owner.id}>{directory.owner.name} · Owner</option>
            )}
            {directory.members
              .filter((item) => item.status === 'active')
              .map((item) => (
                <option key={item.id} value={item.user.id}>
                  {item.user.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          What should they check?
          <textarea
            maxLength={500}
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={busy}
          />
        </label>
        <button className="button" disabled={busy}>
          Request review
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
          Review status
          <select
            aria-label="Review status"
            value={status}
            disabled={busy}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="pending">Pending</option>
            <option value="">All reviews</option>
            <option value="approved">Approved</option>
            <option value="changes">Changes requested</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh reviews
        </button>
      </div>
      {loading ? (
        <p role="status">Loading reviews…</p>
      ) : reviews.length ? (
        <ul className="review-list">
          {reviews.map((item) => (
            <li key={item.id}>
              <article>
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
                <p className="small muted">
                  {item.requester?.name ?? 'Former account'} →{' '}
                  {item.reviewer?.name ?? 'Former account'} · {item.status}
                </p>
                {item.message && <p>{item.message}</p>}
                {item.response && (
                  <p>
                    <strong>Response:</strong> {item.response}
                  </p>
                )}
                {item.canDecide && (
                  <label>
                    Review response for {item.title}
                    <textarea
                      maxLength={500}
                      rows={2}
                      value={responses[item.id] ?? ''}
                      disabled={busy}
                      onChange={(event) =>
                        setResponses({ ...responses, [item.id]: event.target.value })
                      }
                    />
                  </label>
                )}
                <div className="team-actions">
                  {item.canDecide && (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            { action: 'approve', response: responses[item.id] ?? '' },
                            item.id,
                          )
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || !(responses[item.id] ?? '').trim()}
                        onClick={() =>
                          mutate(
                            { action: 'changes', response: responses[item.id] ?? '' },
                            item.id,
                          )
                        }
                      >
                        Request changes
                      </button>
                    </>
                  )}
                  {item.canCancel && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Cancel this review request?'))
                          mutate({ action: 'cancel' }, item.id);
                      }}
                    >
                      Cancel request
                    </button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No reviews match this view.</p>
      )}
      {(page > 1 || hasMore) && (
        <nav className="pagination" aria-label="Review pages">
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
