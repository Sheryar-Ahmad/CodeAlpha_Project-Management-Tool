import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import useModal from '../hooks/useModal.js';
import { request } from '../lib/api.js';
export default function TaskDiscussion({
  projectId,
  task,
  onClose,
  onExpired,
  people = [],
}) {
  const ref = useRef(null),
    lock = useRef(false);
  const [comments, setComments] = useState([]),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const [notified, setNotified] = useState('');
  const [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const endpoint = '/projects/' + projectId + '/collaboration/' + task.id + '/comments';
  useModal(ref);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint + '?page=' + page, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.comments.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setComments(result.comments);
        setHasMore(result.hasMore);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          if (failure.status === 404) setComments([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, revision, onExpired]);
  async function mutate(id) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await request(endpoint + (id ? '/' + id : ''), {
        method: id ? 'DELETE' : 'POST',
        ...(id ? {} : { body: JSON.stringify({ body, notified: notified || null }) }),
      });
      if (!id) {
        setBody('');
        setNotified('');
        setPage(1);
      }
      setRevision((value) => value + 1);
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="discussion-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="discussion-content">
        <div className="dialog-heading">
          <h2 id="discussion-heading">Task discussion</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close discussion"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <h3>{task.title}</h3>
        <p className="small muted">
          Visible to accepted project members. Comments are plain text, newest first.
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {task.lifecycle === 'active' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutate();
            }}
          >
            <label>
              New comment
              <textarea
                required
                maxLength={2000}
                rows={4}
                value={body}
                disabled={busy}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>

            <label>
              Notify a teammate (optional)
              <select
                aria-label="Notify a teammate (optional)"
                value={notified}
                disabled={busy}
                onChange={(event) => setNotified(event.target.value)}
              >
                <option value="">No notification</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">
              One targeted notification appears in their work digest. No email is sent.
            </p>
            <button className="button" disabled={busy || !body.trim()}>
              Add comment
            </button>
          </form>
        )}
        <button
          type="button"
          className="text-button"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh discussion
        </button>
        {loading ? (
          <p role="status">Loading discussion…</p>
        ) : comments.length ? (
          <ul className="discussion-list">
            {comments.map((comment) => (
              <li key={comment.id}>
                <article>
                  <strong>{comment.author?.name ?? 'Former account'}</strong>{' '}
                  <time className="small muted" dateTime={comment.createdAt}>
                    {new Date(comment.createdAt).toLocaleString()}
                  </time>
                  <p>{comment.body}</p>
                  {comment.notified && (
                    <p className="small muted">Notified: {comment.notified.name}</p>
                  )}
                  {comment.canDelete && (
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Permanently delete this comment?'))
                          mutate(comment.id);
                      }}
                    >
                      Delete comment
                    </button>
                  )}
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No comments yet. Keep the next step clear.</p>
        )}
        {(page > 1 || hasMore) && (
          <nav className="pagination" aria-label="Discussion pages">
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
        <p className="small muted">
          You can delete your own comments. The project owner can moderate all comments.
          Comments are not part of the task export.
        </p>
      </div>
    </dialog>
  );
}
