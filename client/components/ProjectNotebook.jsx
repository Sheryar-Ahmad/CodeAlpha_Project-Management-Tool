import useModal from '../hooks/useModal.js';
import { useEffect, useRef, useState } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { notebookKinds, meetingFollowUp } from '../../shared/notebook.js';
import { request, today } from '../lib/api.js';
import { readDemoNotebook, saveDemoNotebook } from '../lib/notebook.js';

export default function ProjectNotebook({
  project,
  demo,
  shared = false,
  onClose,
  onExpired,
  onFollowUp,
}) {
  const ref = useRef(null),
    lock = useRef(false);
  const [entries, setEntries] = useState([]),
    [page, setPage] = useState(1),
    [kind, setKind] = useState('');
  const [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(null),
    [revision, setRevision] = useState(0);
  const endpoint = '/projects/' + project.id + (shared ? '/team-notes' : '/notes');
  useModal(ref);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        let result;
        if (demo) {
          const all = readDemoNotebook().filter(
            (entry) => entry.projectId === project.id && (!kind || entry.kind === kind),
          );
          result = {
            notes: all.slice((page - 1) * 20, page * 20),
            hasMore: all.length > page * 20,
          };
        } else
          result = await request(
            endpoint + '?' + new URLSearchParams({ page: String(page), kind }),
            { signal: controller.signal },
          );
        if (controller.signal.aborted) return;
        if (!result.notes.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setEntries(result.notes);
        setHasMore(result.hasMore);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [demo, endpoint, project.id, page, kind, revision, onExpired]);
  async function mutate(data, id, remove = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (demo) {
        const all = readDemoNotebook();
        if (id && !all.some((entry) => entry.id === id && entry.projectId === project.id))
          throw new Error('This entry has changed. Refresh and try again.');
        const next = remove
          ? all.filter((entry) => entry.id !== id)
          : id
            ? [
                { ...data, id, projectId: project.id },
                ...all.filter((entry) => entry.id !== id),
              ]
            : [{ ...data, id: crypto.randomUUID(), projectId: project.id }, ...all];
        saveDemoNotebook(next);
      } else
        await request(endpoint + (id ? '/' + id : ''), {
          method: remove ? 'DELETE' : id ? 'PATCH' : 'POST',
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
      setEditing(null);
      setRevision((value) => value + 1);
      setNotice(
        remove
          ? 'Entry deleted.'
          : demo
            ? 'Saved in this browser.'
            : 'Saved to this project.',
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
    <dialog
      ref={ref}
      className="notebook-dialog"
      aria-labelledby="notebook-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="notebook-content">
        <div className="dialog-heading">
          <div>
            <h2 id="notebook-title">Project notebook</h2>
            <p className="small muted">{project.name}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close project notebook"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="small muted">
          Keep reference notes, decisions and meeting outcomes together. Entries are
          private and editable; this is not an audit log.
        </p>
        <div className="notebook-toolbar">
          <label>
            <span className="sr-only">Notebook entry type</span>
            <select
              aria-label="Notebook entry type"
              value={kind}
              disabled={busy}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All entries</option>
              {Object.entries(notebookKinds).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() =>
              setEditing({ kind: kind || 'note', title: '', body: '', date: today() })
            }
          >
            <Plus size={15} /> Add entry
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry loading
            </button>
          </p>
        )}
        <p className="small muted" role="status">
          {notice}
        </p>
        {editing && (
          <form
            className="notebook-form"
            key={editing.id ?? 'new'}
            onSubmit={(event) => {
              event.preventDefault();
              const data = Object.fromEntries(new FormData(event.currentTarget));
              data.title = data.title.trim();
              data.body = data.body.trim();
              if (!data.title || !data.body) {
                setError('Add a title and some content.');
                return;
              }
              mutate(data, editing.id);
            }}
          >
            <h3>{editing.id ? 'Edit entry' : 'New entry'}</h3>
            <div className="form-row">
              <label>
                Type
                <select
                  name="kind"
                  aria-label="Entry type"
                  defaultValue={editing.kind}
                  disabled={busy}
                >
                  {Object.entries(notebookKinds).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  name="date"
                  aria-label="Entry date"
                  type="date"
                  min="2000-01-01"
                  max="2100-12-31"
                  required
                  defaultValue={editing.date}
                  disabled={busy}
                />
              </label>
            </div>
            <label>
              Title
              <input
                name="title"
                aria-label="Entry title"
                maxLength={120}
                required
                autoFocus
                defaultValue={editing.title}
                disabled={busy}
              />
            </label>
            <label>
              Content
              <textarea
                name="body"
                aria-label="Entry content"
                maxLength={3000}
                rows={5}
                required
                defaultValue={editing.body}
                disabled={busy}
                placeholder="What happened, what was decided, and what happens next?"
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel entry
              </button>
              <button className="button" disabled={busy}>
                {busy ? 'Saving…' : 'Save entry'}
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <p role="status">Loading notebook…</p>
        ) : entries.length ? (
          <ul className="notebook-entries">
            {entries.map((entry) => (
              <li key={entry.id}>
                <article>
                  <div className="notebook-entry-heading">
                    <span className="project-status">{notebookKinds[entry.kind]}</span>
                    <time dateTime={entry.date}>
                      {new Intl.DateTimeFormat(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }).format(new Date(entry.date + 'T12:00:00'))}
                    </time>
                  </div>
                  <h3>{entry.title}</h3>
                  <p className="notebook-body">{entry.body}</p>
                  <div className="notebook-entry-actions">
                    <button
                      type="button"
                      className="text-button"
                      aria-label={'Edit entry ' + entry.title}
                      disabled={busy || entry.canEdit === false}
                      onClick={() => setEditing(entry)}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={'Delete entry ' + entry.title}
                      disabled={busy || entry.canEdit === false}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Permanently delete this notebook entry? This cannot be undone.',
                          )
                        )
                          mutate(null, entry.id, true);
                      }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                    {entry.kind === 'meeting' && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => onFollowUp(meetingFollowUp(entry, project.name))}
                      >
                        <Plus size={14} /> Create follow-up task
                      </button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            No entries here yet. Record a note, decision, or meeting when you need it.
          </p>
        )}
        {(page > 1 || hasMore) && (
          <nav className="pagination" aria-label="Notebook pages">
            <button
              type="button"
              className="secondary"
              disabled={page === 1 || busy || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous entries
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              className="secondary"
              disabled={!hasMore || busy || loading}
              onClick={() => setPage(page + 1)}
            >
              Next entries
            </button>
          </nav>
        )}
        <p className="small muted">
          {demo
            ? 'Demo entries stay in this browser.'
            : shared
              ? 'Team entries are visible to accepted project members. Members edit their own entries; the owner can manage all entries.'
              : 'Notebook entries are saved to your private account.'}{' '}
          Deleting an entry is permanent. Notebook entries are not included in the task
          export.
        </p>
      </div>
    </dialog>
  );
}
