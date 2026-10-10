import ProjectTimeline from './ProjectTimeline.jsx';
import { useState } from 'react';
import { ArrowUpRight, FolderOpen, Pencil } from 'lucide-react';
import { today } from '../lib/api.js';
import { projectStatuses, projectHealth } from '../../shared/project.js';

export default function ProjectOverview({
  projects,
  loading,
  busy,
  truncated,
  onOpen,
  onEdit,
  onNotebook,
  onConnect,
  date = today(),
}) {
  const [layout, setLayout] = useState('cards');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filtered = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  return (
    <section aria-labelledby="projects-heading" aria-busy={loading}>
      <div className="board-toolbar">
        <div>
          <h2 id="projects-heading">Your projects</h2>
          <p className="small muted">
            Progress, deadlines, and work that needs attention.
          </p>
        </div>
        <label>
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            maxLength={60}
            value={search}
            placeholder="Find a project…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <div className="view-switch" role="group" aria-label="Project layout">
        <button
          type="button"
          aria-pressed={layout === 'cards'}
          onClick={() => setLayout('cards')}
        >
          Project cards
        </button>
        <button
          type="button"
          aria-pressed={layout === 'timeline'}
          onClick={() => setLayout('timeline')}
        >
          Project timeline
        </button>
      </div>
      {loading ? (
        <div className="project-grid">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : layout === 'timeline' ? (
        <ProjectTimeline
          projects={filtered.slice((currentPage - 1) * 12, currentPage * 12)}
          busy={busy}
          onOpen={onOpen}
          onEdit={onEdit}
        />
      ) : (
        <div className="project-grid">
          {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((project) => {
            const health = projectHealth(project, date);
            const percent = project.total
              ? Math.round((project.completed / project.total) * 100)
              : 0;
            const next = project.nextDue
              ? new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                }).format(new Date(project.nextDue + 'T12:00:00'))
              : 'No unfinished deadlines';
            return (
              <article className="project-card" key={project.name}>
                <span className="feature-icon">
                  <FolderOpen size={21} />
                </span>
                <div className="project-record-heading">
                  <h3>{project.name}</h3>
                  <span
                    className={
                      'project-status project-status-' + (project.status ?? 'group')
                    }
                  >
                    {project.status ? projectStatuses[project.status] : 'Task group'}
                  </span>
                </div>
                {project.description && (
                  <details className="project-brief">
                    <summary>Project brief</summary>
                    <p>{project.description}</p>
                  </details>
                )}
                {(project.startDate || project.targetDate) && (
                  <dl className="project-dates">
                    {project.startDate && (
                      <div>
                        <dt>Starts</dt>
                        <dd>
                          {new Intl.DateTimeFormat(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(project.startDate + 'T12:00:00'))}
                        </dd>
                      </div>
                    )}
                    {project.targetDate && (
                      <div>
                        <dt>Target</dt>
                        <dd>
                          {new Intl.DateTimeFormat(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          }).format(new Date(project.targetDate + 'T12:00:00'))}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                <details
                  className={
                    'project-health' + (health.reasons.length ? ' has-flags' : '')
                  }
                >
                  <summary>{health.label}</summary>
                  {health.reasons.length ? (
                    <ul>
                      {health.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No blocked tasks, overdue deadlines, or recorded planning conflicts.
                      This is a rules-based check, not a forecast.
                    </p>
                  )}
                </details>
                {project.milestones?.length > 0 && (
                  <details className="project-milestones">
                    <summary>
                      Milestones ({project.milestones.filter((item) => item.done).length}/
                      {project.milestones.length})
                    </summary>
                    <ul>
                      {project.milestones.map((item) => (
                        <li key={item.id}>
                          <span className={item.done ? 'step-done' : ''}>
                            {item.title}
                          </span>
                          <small>
                            {item.done
                              ? 'Complete'
                              : item.due
                                ? new Intl.DateTimeFormat(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }).format(new Date(item.due + 'T12:00:00'))
                                : 'No date set'}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="small muted">
                  {project.completed} of {project.total} tasks complete
                </p>
                <div
                  className="project-progress"
                  role="progressbar"
                  aria-label={'Completion for ' + project.name}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: percent + '%' }} />
                </div>
                <div className="project-metrics">
                  <span>{percent}% complete</span>
                  <span>{project.active} in progress</span>
                </div>
                <p className="project-deadline">Next due: {next}</p>
                {project.blocked > 0 && (
                  <p className="project-blocked">
                    {project.blocked} blocked {project.blocked === 1 ? 'task' : 'tasks'}
                  </p>
                )}
                {project.overdue > 0 && (
                  <p className="project-warning">
                    {project.overdue} overdue {project.overdue === 1 ? 'task' : 'tasks'}
                  </p>
                )}
                <div className="project-actions">
                  <button
                    className="text-button project-open"
                    disabled={busy}
                    onClick={() => onOpen(project.name)}
                    aria-label={'Open tasks for ' + project.name}
                  >
                    View tasks <ArrowUpRight size={14} />
                  </button>
                  {project.id && (
                    <button
                      type="button"
                      className="text-button project-edit"
                      disabled={busy}
                      aria-label={'Connect existing tasks for ' + project.name}
                      onClick={() => onConnect(project)}
                    >
                      Connect existing tasks
                    </button>
                  )}
                  {project.id && (
                    <button
                      type="button"
                      className="text-button project-edit"
                      aria-label={'Open notebook for ' + project.name}
                      disabled={busy}
                      onClick={() => onNotebook(project)}
                    >
                      Project notebook
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button project-edit"
                    disabled={busy}
                    aria-label={
                      (project.id
                        ? 'Edit project details for '
                        : 'Add project details for ') + project.name
                    }
                    onClick={() => onEdit(project)}
                  >
                    <Pencil size={14} aria-hidden="true" />{' '}
                    {project.id ? 'Edit details' : 'Add project details'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !filtered.length && (
        <p className="empty">
          No projects found. Create a project before adding its first task.
        </p>
      )}
      {truncated && (
        <p className="small muted">
          Showing the first 1,000 project records. Some project details are outside this
          list.
        </p>
      )}
      {filtered.length > 12 && (
        <nav className="pagination" aria-label="Project pages">
          <button
            className="secondary"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>Page {currentPage}</span>
          <button
            className="secondary"
            disabled={currentPage * 12 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
