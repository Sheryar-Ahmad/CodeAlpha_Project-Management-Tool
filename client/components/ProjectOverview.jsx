import { useState } from 'react';
import { ArrowUpRight, FolderOpen } from 'lucide-react';

export default function ProjectOverview({ projects, loading, onOpen }) {
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
      {loading ? (
        <div className="project-grid">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      ) : (
        <div className="project-grid">
          {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((project) => {
            const percent = Math.round((project.completed / project.total) * 100);
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
                <h3>{project.name}</h3>
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
                <button
                  className="text-button project-open"
                  onClick={() => onOpen(project.name)}
                  aria-label={'Open tasks for ' + project.name}
                >
                  View tasks <ArrowUpRight size={14} />
                </button>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !filtered.length && (
        <p className="empty">
          No projects found. Add a task with a project name to start.
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
