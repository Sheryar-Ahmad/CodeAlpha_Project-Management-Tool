import { useEffect, useState } from 'react';
import { request } from '../lib/api.js';
import { taskStatuses } from '../../shared/task.js';
import { projectStatuses } from '../../shared/project.js';
export default function GuestPortal({ projectId, onExpired }) {
  const [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRevision((value) => value + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(
      '/projects/' +
        projectId +
        '/guest?' +
        new URLSearchParams({ page: String(page), search: query }),
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.tasks.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setData(result);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, page, query, revision, onExpired]);
  return (
    <section className="team-panel" aria-labelledby="guest-heading" aria-busy={loading}>
      <div className="team-toolbar">
        <h2 id="guest-heading">Guest project portal</h2>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh portal
        </button>
      </div>
      <p className="small muted">
        Read-only access to the project brief, milestones, and active-task summaries.
        Private notes and team conversations are not included.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading project portal…</p>}
      {data && (
        <>
          <h3>{data.project.name}</h3>
          <p>{data.project.description}</p>
          <p className="small muted">
            {projectStatuses[data.project.status]} · Target:{' '}
            {data.project.targetDate || 'Not set'} · {data.completed} of {data.total}{' '}
            tasks complete
          </p>
          {data.project.milestones.length > 0 && (
            <ul className="guest-milestones">
              {data.project.milestones.map((item) => (
                <li key={item.id}>
                  {item.done ? 'Complete' : 'Open'} · {item.title} ·{' '}
                  {item.due || 'No date'}
                </li>
              ))}
            </ul>
          )}
          <label className="guest-search">
            Search task titles
            <input
              type="search"
              value={search}
              maxLength={120}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ul className="guest-task-list">
            {data.tasks.map((task) => (
              <li key={task.id}>
                <article className="task-card">
                  <div className="card-top">
                    <span>{taskStatuses[task.status]}</span>
                    <span className={'tag priority-' + task.priority}>
                      {task.priority}
                    </span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  <p className="small muted">Due: {task.due || 'Not set'}</p>
                </article>
              </li>
            ))}
          </ul>
          {!data.tasks.length && !loading && (
            <p className="empty">No matching active tasks.</p>
          )}
          {(page > 1 || data.hasMore) && (
            <nav className="pagination" aria-label="Guest task pages">
              <button
                className="secondary"
                disabled={loading || page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="secondary"
                disabled={loading || !data.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
