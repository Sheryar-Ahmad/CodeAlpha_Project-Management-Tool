import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { weekBounds, loggedTime } from '../../shared/workLog.js';
import { request, today } from '../lib/api.js';
import { readDemoWorkLogs, saveDemoWorkLogs } from '../lib/workLogs.js';
import WorkLogDialog from './WorkLogDialog.jsx';

export default function TimeTracking({ demo, projects, onExpired }) {
  const lock = useRef(false);
  const [date, setDate] = useState(today),
    [project, setProject] = useState(''),
    [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [truncated, setTruncated] = useState(false),
    [dialog, setDialog] = useState(null);
  const range = weekBounds(date);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        const range = weekBounds(date);
        const result = demo
          ? {
              logs: readDemoWorkLogs()
                .filter(
                  (log) =>
                    log.date >= range.start &&
                    log.date <= range.end &&
                    (!project || log.project === project),
                )
                .sort((a, b) => b.date.localeCompare(a.date)),
              truncated: false,
            }
          : await request('/work-logs?' + new URLSearchParams({ date, project }), {
              signal: controller.signal,
            });
        if (!controller.signal.aborted) {
          setLogs(result.logs);
          setTruncated(result.truncated);
        }
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
  }, [demo, date, project, revision, onExpired]);
  async function mutate(data, id, remove = false) {
    if (lock.current) throw new Error('Please wait for the current save.');
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (demo) {
        const all = readDemoWorkLogs();
        if (id && !all.some((log) => log.id === id))
          throw new Error('This work log has changed. Refresh and try again.');
        saveDemoWorkLogs(
          remove
            ? all.filter((log) => log.id !== id)
            : id
              ? all.map((log) => (log.id === id ? { ...data, id } : log))
              : [{ ...data, id: crypto.randomUUID() }, ...all],
        );
      } else
        await request('/work-logs' + (id ? '/' + id : ''), {
          method: remove ? 'DELETE' : id ? 'PATCH' : 'POST',
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
      if (data) {
        setDate(data.date);
        setProject('');
        setPage(1);
      }
      setRevision((value) => value + 1);
      setNotice(
        remove
          ? 'Work log deleted.'
          : demo
            ? 'Saved in this browser.'
            : 'Work log saved.',
      );
    } catch (failure) {
      if (failure.status === 401) onExpired();
      throw failure;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const currentLogs = loading ? [] : logs;
  const total = currentLogs.reduce((sum, log) => sum + log.minutes, 0);
  const days = new Map(),
    groups = new Map();
  for (const log of currentLogs) {
    days.set(log.date, (days.get(log.date) ?? 0) + log.minutes);
    groups.set(log.project, (groups.get(log.project) ?? 0) + log.minutes);
  }
  const currentPage = Math.min(page, Math.max(1, Math.ceil(logs.length / 20)));
  const choices = [
    ...new Set([
      ...projects,
      ...logs.map((log) => log.project),
      ...(project ? [project] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  return (
    <section aria-labelledby="time-heading" aria-busy={loading}>
      <div className="board-toolbar">
        <div>
          <h2 id="time-heading">Your weekly work log</h2>
          <p className="small muted">
            Monday to Sunday · {range.start} to {range.end}
          </p>
        </div>
        <button
          type="button"
          className="button"
          disabled={busy || loading}
          onClick={() => setDialog({ log: null })}
        >
          <Plus size={16} /> Record time
        </button>
      </div>
      <div className="time-filters">
        <label>
          Week containing
          <input
            aria-label="Week containing"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={date}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid) {
                setDate(event.target.value);
                setPage(1);
              }
            }}
          />
        </label>
        <label>
          Project
          <select
            aria-label="Work log project filter"
            value={project}
            disabled={busy}
            onChange={(event) => {
              setProject(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All projects</option>
            {choices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      <p className="small muted" role="status">
        {notice}
      </p>
      {truncated && (
        <p className="error-banner" role="status">
          This week has more than 1,000 entries. Showing the first 1,000; totals below are
          partial. Filter by project to narrow the results.
        </p>
      )}
      <div className="time-summary">
        <article>
          <span className="small muted">
            Recorded time{project ? ' for ' + project : ''}
          </span>
          <strong>{loading ? '…' : loggedTime(total)}</strong>
          <span className="small muted">
            {loading ? 'Loading entries' : logs.length + ' entries'}
          </span>
        </article>
        <details>
          <summary>Totals by day</summary>
          <dl>
            {[...days.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, minutes]) => (
                <div key={day}>
                  <dt>{day}</dt>
                  <dd>{loggedTime(minutes)}</dd>
                </div>
              ))}
          </dl>
          {!days.size && <p className="small muted">No recorded work this week.</p>}
        </details>
        <details>
          <summary>Totals by project</summary>
          <dl>
            {[...groups.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, minutes]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{loggedTime(minutes)}</dd>
                </div>
              ))}
          </dl>
          {!groups.size && <p className="small muted">No recorded work this week.</p>}
        </details>
      </div>
      {loading ? (
        <p role="status">Loading work logs…</p>
      ) : logs.length ? (
        <ul className="work-log-list">
          {logs.slice((currentPage - 1) * 20, currentPage * 20).map((log) => (
            <li key={log.id}>
              <article>
                <div>
                  <p className="small muted">
                    {log.project} · <time dateTime={log.date}>{log.date}</time>
                  </p>
                  <h3>{log.activity}</h3>
                  {log.notes && <p className="small muted work-log-notes">{log.notes}</p>}
                </div>
                <div className="work-log-actions">
                  <strong>{loggedTime(log.minutes)}</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={'Edit work log ' + log.activity}
                    disabled={busy}
                    onClick={() => setDialog({ log })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={'Delete work log ' + log.activity}
                    disabled={busy}
                    onClick={async () => {
                      if (
                        window.confirm(
                          'Permanently delete this work log? This cannot be undone.',
                        )
                      )
                        try {
                          await mutate(null, log.id, true);
                        } catch (failure) {
                          setError(failure.message);
                        }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="board-empty list-empty">
          <h3>No work logs in this week</h3>
          <p>Record time after working on a task or project.</p>
        </div>
      )}
      {logs.length > 20 && (
        <nav className="pagination" aria-label="Work log pages">
          <button
            type="button"
            className="secondary"
            disabled={busy || loading || currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous logs
          </button>
          <span>Page {currentPage}</span>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading || currentPage * 20 >= logs.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next logs
          </button>
        </nav>
      )}
      <p className="small muted">
        Manual entries can overlap and do not prove capacity or billable hours. Work logs
        are separate from the focus timer and task export. Deletion is permanent.
      </p>
      {dialog && (
        <WorkLogDialog
          log={dialog.log}
          date={date}
          projects={choices}
          onClose={() => setDialog(null)}
          onSave={mutate}
        />
      )}
    </section>
  );
}
