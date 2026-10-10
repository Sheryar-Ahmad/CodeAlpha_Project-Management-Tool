import { useState } from 'react';
import { today } from '../lib/api.js';
import { monthBounds, validMonth } from '../../shared/calendar.js';
import { timelinePosition } from '../../shared/timeline.js';
import { projectStatuses } from '../../shared/project.js';
export default function ProjectTimeline({ projects, busy, onOpen, onEdit }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const days = Number(monthBounds(month).end.slice(8));
  return (
    <section aria-label="Project timeline">
      <div className="calendar-toolbar">
        <p className="small muted">
          Recorded project dates, clipped to the selected month. This view does not
          schedule tasks automatically.
        </p>
        <label>
          <span className="sr-only">Timeline month</span>
          <input
            aria-label="Timeline month"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            disabled={busy}
            onChange={(event) => {
              if (validMonth(event.target.value)) setMonth(event.target.value);
            }}
          />
        </label>
      </div>
      <div className="timeline-scale" aria-hidden="true">
        <span>Day 1</span>
        <span>Day {Math.ceil(days / 2)}</span>
        <span>Day {days}</span>
      </div>
      <ul className="project-timeline">
        {projects.map((project) => {
          const position = timelinePosition(project, month);
          return (
            <li key={project.name}>
              <article>
                <div className="timeline-label">
                  <h3>{project.name}</h3>
                  <p className="small muted">
                    {projectStatuses[project.status] ?? 'Task group'}
                    {project.startDate ? ' · Starts ' + project.startDate : ''}
                    {project.targetDate ? ' · Target ' + project.targetDate : ''}
                  </p>
                  <div className="timeline-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      aria-label={'Open tasks for ' + project.name}
                      onClick={() => onOpen(project.name)}
                    >
                      View tasks
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      aria-label={
                        (project.id
                          ? 'Edit project details for '
                          : 'Add project details for ') + project.name
                      }
                      onClick={() => onEdit(project)}
                    >
                      {project.id ? 'Edit dates' : 'Add project details'}
                    </button>
                  </div>
                </div>
                <div
                  className="timeline-track"
                  aria-label={
                    position.kind === 'undated'
                      ? 'No project dates set'
                      : position.kind === 'outside'
                        ? 'Project dates are outside this month'
                        : project.name +
                          ' from ' +
                          (project.startDate || project.targetDate) +
                          ' to ' +
                          (project.targetDate || project.startDate)
                  }
                >
                  {['span', 'checkpoint'].includes(position.kind) ? (
                    <span
                      className={'timeline-bar status-' + (project.status ?? 'planned')}
                      style={{ left: position.left + '%', width: position.width + '%' }}
                    >
                      <span className="sr-only">
                        {position.kind === 'checkpoint'
                          ? 'Single dated checkpoint'
                          : 'Project date range'}
                      </span>
                    </span>
                  ) : (
                    <span className="small muted timeline-message">
                      {position.kind === 'undated'
                        ? 'No project dates set'
                        : 'Outside this month'}
                    </span>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
