import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { request, today } from '../lib/api.js';
import { projectStatuses } from '../../shared/project.js';

export default function Portfolio({ demo, onExpired, onOpen, onPrivateTask, onTeams }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function markRead(item) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await request(
        '/projects/' +
          item.projectId +
          '/collaboration/' +
          item.taskId +
          '/comments/' +
          item.id +
          '/read',
        { method: 'PATCH', body: '{}' },
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request('/teams/portfolio?date=' + today(), { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        // Clear stale shared summaries whenever access or connectivity changes.
        setReport(null);
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, revision, onExpired]);
  useEffect(() => {
    if (demo) return;
    const refresh = () => {
      if (!document.hidden) setRevision((value) => value + 1);
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [demo]);
  if (demo)
    return (
      <section className="team-panel">
        <h2>Bring your projects into one view</h2>
        <p>
          The portfolio combines owned and joined projects. Create an account to use team
          reports and your work digest.
        </p>
        <a className="button primary" href="app.html?auth=register">
          Create your account <ArrowUpRight size={16} />
        </a>
      </section>
    );
  const projects = report?.projects ?? [];
  const filtered = projects.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const maxPage = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, maxPage);
  const digest = report?.digest;
  const flagged = projects.filter((item) => item.health.reasons.length).length;
  return (
    <div className="portfolio-view">
      <section className="team-panel" aria-labelledby="portfolio-summary">
        <div className="section-heading">
          <div>
            <h2 id="portfolio-summary">Your project portfolio</h2>
            <p>
              Owned and joined projects · Connected active tasks · As of{' '}
              {report?.date ?? today()}
            </p>
          </div>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={16} /> Refresh portfolio
          </button>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Refreshing your portfolio…</p>}
        {report && (
          <div className="portfolio-summary">
            <span>
              <strong>{projects.length}</strong> projects
            </span>
            <span>
              <strong>{flagged}</strong> need attention
            </span>
            <span>
              <strong>{projects.reduce((sum, item) => sum + item.overdue, 0)}</strong>{' '}
              overdue tasks
            </span>
          </div>
        )}
        <p className="muted">
          Guest portals stay in Team projects. These flags describe current work; they are
          not delivery forecasts.
        </p>
        {report?.truncated && (
          <p role="status">
            Showing up to 100 owned and 100 joined projects. This is a partial report.
          </p>
        )}
      </section>
      {digest && (
        <section className="team-panel" aria-labelledby="work-digest">
          <h2 id="work-digest">Your work digest</h2>
          <p>
            A current snapshot of urgent owned work and shared tasks assigned to you.
            Refreshes while this tab is visible; no emails are sent.
          </p>
          {!digest.notifications.length &&
            !digest.tasks.length &&
            !digest.reviews.length &&
            !digest.requests.length &&
            !digest.invitations.length && (
              <p className="empty-state">Nothing needs your attention right now.</p>
            )}

          {digest.notifications.length > 0 && (
            <div className="digest-group">
              <h3>Discussion notifications ({digest.notifications.length})</h3>
              <ul className="digest-list">
                {digest.notifications.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.project} · A teammate asked for your attention in the
                        discussion.
                      </span>
                    </div>
                    <div className="team-actions">
                      <button
                        className="button secondary"
                        onClick={() => onOpen(item.projectId, 'tasks')}
                      >
                        View project
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || loading}
                        onClick={() => markRead(item)}
                      >
                        Mark read
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {digest.invitations.length > 0 && (
            <div className="digest-group">
              <h3>Project invitations ({digest.invitations.length})</h3>
              <ul className="digest-list">
                {digest.invitations.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.project}</strong>
                      <span>
                        {item.role === 'guest'
                          ? 'Read-only guest invitation'
                          : 'Team invitation'}
                      </span>
                    </div>
                    <button className="button secondary" onClick={onTeams}>
                      View invitation
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {digest.tasks.length > 0 && (
            <div className="digest-group">
              <h3>Work to follow up ({digest.tasks.length})</h3>
              <ul className="digest-list">
                {digest.tasks.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.project} · {item.reasons.join(' · ')}
                      </span>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() =>
                        item.shared
                          ? onOpen(item.projectId, 'tasks')
                          : onPrivateTask(item.title)
                      }
                    >
                      View work
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {[
            ['reviews', 'Awaiting your review', 'reviews'],
            ['requests', 'Intake to triage', 'requests'],
          ].map(
            ([key, title, panel]) =>
              digest[key].length > 0 && (
                <div className="digest-group" key={key}>
                  <h3>
                    {title} ({digest[key].length})
                  </h3>
                  <ul className="digest-list">
                    {digest[key].map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.project}</span>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => onOpen(item.projectId, panel)}
                        >
                          Open project
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {digest.truncated && (
            <p role="status">
              Each digest group shows at most 30 items. Use the project views to see more.
            </p>
          )}
        </section>
      )}
      {report && (
        <section className="team-panel" aria-labelledby="portfolio-projects">
          <div className="section-heading">
            <h2 id="portfolio-projects">Across your projects</h2>
            <label>
              Find a portfolio project
              <input
                type="search"
                maxLength={120}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
          {!filtered.length && (
            <p className="empty-state">
              {projects.length
                ? 'No projects match your search.'
                : 'Create a project or accept a team invitation to get started.'}
            </p>
          )}
          <div className="portfolio-grid">
            {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((item) => (
              <article className="portfolio-card" key={item.id}>
                <div className="section-heading">
                  <h3>{item.name}</h3>
                  <span className="badge">
                    {item.role === 'owner' ? 'Owned' : 'Joined'}
                  </span>
                </div>
                <p>
                  {projectStatuses[item.status]} · Target: {item.targetDate || 'Not set'}
                </p>
                <label className="portfolio-progress">
                  {item.completed} of {item.total} tasks done
                  <progress value={item.completed} max={item.total || 1} />
                </label>
                <p>Next deadline: {item.nextDue || 'Not set'}</p>
                <strong className={item.health.reasons.length ? 'portfolio-flag' : ''}>
                  {item.health.label}
                </strong>
                {item.health.reasons.length > 0 && (
                  <ul>
                    {item.health.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <button
                  className="button secondary"
                  onClick={() => onOpen(item.id, 'tasks')}
                >
                  Open project <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {maxPage > 1 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous projects
              </button>
              <span>
                Page {currentPage} of {maxPage}
              </span>
              <button
                className="button secondary"
                disabled={currentPage === maxPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Next projects
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
