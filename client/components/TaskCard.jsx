import { CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { today } from '../lib/api.js';

export const statuses = { todo: 'To do', progress: 'In progress', done: 'Done' };
export default function TaskCard({ task, onEdit, onDelete, onStatus, busy }) {
  const overdue = task.due && task.due < today() && task.status !== 'done';
  const date = task.due
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(task.due + 'T12:00:00'),
      )
    : 'No due date';
  return (
    <article className="task-card">
      <div className="card-top">
        <span className="project-name">{task.project}</span>
        <span className={'tag priority-' + task.priority}>{task.priority}</span>
      </div>
      <h3 className="task-title">{task.title}</h3>
      {task.description && <p className="task-description">{task.description}</p>}
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
          aria-label={'Edit ' + task.title}
          onClick={() => onEdit(task)}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="card-icon danger"
          disabled={busy}
          aria-label={'Delete ' + task.title}
          onClick={() => onDelete(task)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}
