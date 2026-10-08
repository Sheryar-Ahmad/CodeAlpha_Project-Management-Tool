import {
  CalendarDays,
  CirclePause,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react';
import { today } from '../lib/api.js';
import { taskStatuses } from '../../shared/task.js';

export const statuses = taskStatuses;
export default function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatus,
  onChecklist,
  onDuplicate,
  busy,
}) {
  const overdue = task.due && task.due < today() && task.status !== 'done';
  const date = task.due
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(task.due + 'T12:00:00'),
      )
    : 'No due date';
  const steps = task.checklist ?? [];
  const completed = steps.filter((step) => step.done).length;
  return (
    <article className="task-card">
      <div className="task-information">
        <div className="card-top">
          <span className="project-name">{task.project}</span>
          <span className={'tag priority-' + task.priority}>{task.priority}</span>
        </div>
        <h3 className="task-title">{task.title}</h3>
        {task.description && <p className="task-description">{task.description}</p>}
        {task.status === 'blocked' && (
          <div className="task-blocker">
            <span>
              <CirclePause size={13} aria-hidden="true" /> Waiting on a next step
            </span>
            <p>{task.blockerReason}</p>
          </div>
        )}
        {(task.notes || task.links?.length > 0) && (
          <details className="task-context">
            <summary>Notes &amp; resources</summary>
            {task.notes && <p className="task-notes">{task.notes}</p>}
            {task.links?.length > 0 && (
              <ul className="resource-links">
                {task.links.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label + ' (opens in a new tab)'}
                    >
                      <ExternalLink size={13} aria-hidden="true" /> {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
        {steps.length > 0 && (
          <details className="task-checklist">
            <summary>
              {completed}/{steps.length} steps complete
            </summary>
            <ul>
              {steps.map((step) => (
                <li key={step.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={step.done}
                      disabled={busy}
                      aria-label={'Complete ' + step.text + ' for ' + task.title}
                      onChange={(event) =>
                        onChecklist(
                          task,
                          steps.map((item) =>
                            item.id === step.id
                              ? { ...item, done: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <span className={step.done ? 'step-done' : ''}>{step.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="task-meta">
        <div className={'task-date' + (overdue ? ' is-overdue' : '')}>
          <CalendarDays size={13} aria-hidden="true" /> {overdue ? 'Overdue · ' : ''}
          {date}
        </div>
        <div className="task-actions">
          <label className="sr-only" htmlFor={'status-' + task.id}>
            Status for {task.title}
          </label>
          <select
            id={'status-' + task.id}
            value={task.status}
            disabled={busy}
            onChange={(event) => onStatus(task, event.target.value)}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="card-icon"
            disabled={busy}
            aria-label={'Duplicate ' + task.title}
            title="Duplicate task"
            onClick={() => onDuplicate(task)}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="card-icon"
            disabled={busy}
            aria-label={'Edit ' + task.title}
            title="Edit task"
            onClick={() => onEdit(task)}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="card-icon danger"
            disabled={busy}
            aria-label={'Delete ' + task.title}
            title="Delete task"
            onClick={() => onDelete(task)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
