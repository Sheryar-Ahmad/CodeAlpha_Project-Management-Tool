import { useEffect, useRef, useState } from 'react';
import { X, Plus, RefreshCw } from 'lucide-react';
import useModal from '../hooks/useModal.js';
import { request } from '../lib/api.js';
import TaskDialog from './TaskDialog.jsx';
import { taskStatuses } from '../../shared/task.js';

const fieldLabels = {
  estimateMinutes: 'Time estimate',
  durationDays: 'Planning duration',
  blockerReason: 'Blocker reason',
  due: 'Deadline',
  recurrence: 'Repeat schedule',
};

// One on-demand panel keeps child tasks and recent history off ordinary board queries.
export default function TaskDetails({
  taskId,
  projectId,
  onClose,
  onExpired,
  onChanged,
}) {
  const ref = useRef(null),
    lock = useRef(false),
    creationKey = useRef(crypto.randomUUID());
  const [selected, setSelected] = useState(taskId);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null),
    [panel, setPanel] = useState('subtasks');
  useModal(ref);
  const base = projectId ? '/projects/' + projectId + '/tasks' : '/tasks';
  const endpoint = base + '/' + selected;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint + '/details?page=' + page, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.children.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setResult(data);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult(null);
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, revision, onExpired]);
  async function change(path, method, body, message) {
    if (lock.current) throw new Error('Please wait for the current save.');
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await request(path, { method, body: JSON.stringify(body) });
      setRevision((value) => value + 1);
      onChanged();
      setNotice(
        data?.previouslyRemoved
          ? 'This earlier subtask was removed or detached. It was not recreated.'
          : message,
      );
      return data;
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else {
        setError(failure.message);
        // A lost response can leave a reservation behind. Reload its saved state
        // so closing the editor reveals the Resume action instead of another create.
        if (method === 'POST' && path.endsWith('/subtasks'))
          setRevision((value) => value + 1);
      }
      throw failure;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function act(promise) {
    promise.catch(() => {});
  }
  function edit(task) {
    setEditor({ task });
  }
  const task = result?.task?.id === selected ? result.task : null;
  const active = task?.lifecycle === 'active';
  function newChild() {
    creationKey.current = crypto.randomUUID();
    setEditor({
      task: { project: task.project, parentTask: task.id, recurrence: 'none' },
    });
  }
  return (
    <>
      <dialog
        ref={ref}
        aria-labelledby="task-details-heading"
        className="task-details-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy && !editor) onClose();
        }}
      >
        <div className="task-details-content">
          <div className="dialog-heading">
            <h2 id="task-details-heading">Task details</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close task details"
              disabled={busy || Boolean(editor)}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
          {loading && <p role="status">Loading task details…</p>}
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {task && (
            <>
              <h3>{task.title}</h3>
              <p>
                {task.project} · {taskStatuses[task.status]} · {task.lifecycle}
              </p>
              <div className="team-tabs" aria-label="Task details views">
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={panel === 'subtasks'}
                  onClick={() => setPanel('subtasks')}
                >
                  Subtasks
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={panel === 'activity'}
                  onClick={() => setPanel('activity')}
                >
                  Activity
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={loading || busy}
                  onClick={() => setRevision((value) => value + 1)}
                >
                  <RefreshCw size={15} /> Refresh details
                </button>
              </div>
              {panel === 'subtasks' ? (
                <>
                  <p>
                    Each subtask has its own status, deadline and assignee. Parent
                    completion and archive/trash actions do not change child tasks.
                    Estimates count each task's own work.
                  </p>
                  {task.parentTask ? (
                    <div className="task-parent-panel">
                      {result.parent ? (
                        <>
                          <p>
                            Parent: <strong>{result.parent.title}</strong>
                          </p>
                          <button
                            className="secondary"
                            onClick={() => {
                              setSelected(result.parent.id);
                              setPage(1);
                              setNotice('');
                            }}
                          >
                            Open parent task
                          </button>
                        </>
                      ) : (
                        <p>The parent is no longer available in this project.</p>
                      )}
                      <button
                        className="text-button"
                        disabled={busy || !active}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Make this an independent task? Its project, content and assignment stay saved.',
                            )
                          )
                            act(
                              change(
                                endpoint + '/subtasks/detach',
                                'PATCH',
                                {},
                                'Subtask detached. It is now an independent task.',
                              ),
                            );
                        }}
                      >
                        Detach from parent
                      </button>
                    </div>
                  ) : (
                    <>
                      {result.pending ? (
                        <div className="error-banner">
                          <div>
                            <strong>Finish subtask setup: {result.pending.title}</strong>
                            <p>
                              A previous save was interrupted. Resume it before adding
                              another or moving this parent.
                            </p>
                          </div>
                          <button
                            className="secondary"
                            disabled={busy || !active}
                            onClick={() =>
                              act(
                                change(
                                  endpoint + '/subtasks/resume',
                                  'POST',
                                  {},
                                  'Subtask setup resumed.',
                                ),
                              )
                            }
                          >
                            Resume subtask setup
                          </button>
                        </div>
                      ) : (
                        <button
                          className="button primary"
                          disabled={busy || !active || task.recurrence !== 'none'}
                          onClick={newChild}
                        >
                          <Plus size={16} /> Add subtask
                        </button>
                      )}
                      {task.recurrence !== 'none' && (
                        <p>
                          Recurring tasks use checklist steps. Independent subtasks do not
                          repeat.
                        </p>
                      )}
                      {!result.children.length && !loading && (
                        <p className="empty">No subtasks yet.</p>
                      )}
                      <ul className="subtask-list">
                        {result.children.map((child) => (
                          <li key={child.id}>
                            <article>
                              <h4>{child.title}</h4>
                              <p>
                                {taskStatuses[child.status]} · Due:{' '}
                                {child.due || 'Not set'} · {child.lifecycle}
                              </p>
                              <label>
                                Assignee for subtask {child.title}
                                <select
                                  aria-label={'Assignee for subtask ' + child.title}
                                  value={child.assignee ?? ''}
                                  disabled={busy || child.lifecycle !== 'active'}
                                  onChange={(event) =>
                                    act(
                                      change(
                                        '/projects/' +
                                          task.projectId +
                                          '/collaboration/' +
                                          child.id +
                                          '/assignee',
                                        'PATCH',
                                        { assignee: event.target.value || null },
                                        'Subtask assignment saved.',
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {child.assignee &&
                                    !result.people.some(
                                      (person) => person.id === child.assignee,
                                    ) && (
                                      <option value={child.assignee}>
                                        Former member — reassign
                                      </option>
                                    )}
                                  {result.people.map((person) => (
                                    <option key={person.id} value={person.id}>
                                      {person.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="team-actions">
                                <button
                                  className="secondary"
                                  disabled={busy || child.lifecycle !== 'active'}
                                  onClick={() => edit(child)}
                                >
                                  Edit subtask
                                </button>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => {
                                    setSelected(child.id);
                                    setPage(1);
                                    setNotice('');
                                  }}
                                >
                                  Open subtask details
                                </button>
                              </div>
                            </article>
                          </li>
                        ))}
                      </ul>
                      {(page > 1 || result.hasMore) && (
                        <div className="pagination">
                          <button
                            className="secondary"
                            disabled={busy || loading || page === 1}
                            onClick={() => setPage(page - 1)}
                          >
                            Previous subtasks
                          </button>
                          <span>Page {page}</span>
                          <button
                            className="secondary"
                            disabled={busy || loading || !result.hasMore}
                            onClick={() => setPage(page + 1)}
                          >
                            Next subtasks
                          </button>
                        </div>
                      )}
                      <p className="small muted">
                        Subtasks also appear on the board. Detach or permanently remove
                        them before moving or permanently deleting their parent. Existing
                        task limits and permissions still apply.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <section aria-labelledby="task-history-heading">
                  <h3 id="task-history-heading">Recent task activity</h3>
                  <p className="small muted">
                    The latest 50 recorded changes appear here. Earlier notes and field
                    values are not kept in this history.
                  </p>
                  {!result.activity.length ? (
                    <p>No recorded changes yet.</p>
                  ) : (
                    <ol className="task-history">
                      {result.activity.map((event, index) => (
                        <li key={index}>
                          <strong>{event.action}</strong>
                          <p>
                            {event.name} ·{' '}
                            <time dateTime={event.at}>
                              {new Date(event.at).toLocaleString()}
                            </time>
                          </p>
                          {event.fields.length > 0 && (
                            <p className="small muted">
                              Changed:{' '}
                              {event.fields
                                .map((field) => fieldLabels[field] ?? field)
                                .join(', ')}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </dialog>
      {editor && (
        <TaskDialog
          task={editor.task}
          lockedProject
          projectNames={[editor.task.project]}
          onClose={() => setEditor(null)}
          onSave={(data, id) =>
            id
              ? change(base + '/' + id, 'PATCH', data, 'Subtask updated.')
              : change(
                  endpoint + '/subtasks',
                  'POST',
                  { key: creationKey.current, task: data },
                  'Subtask added.',
                )
          }
        />
      )}
    </>
  );
}
