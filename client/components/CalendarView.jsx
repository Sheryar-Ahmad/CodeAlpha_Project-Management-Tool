import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { calendarWeeks, moveMonth } from '../../shared/calendar.js';

function dateLabel(date, options) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(date + 'T12:00:00'));
}
export default function CalendarView({
  month,
  onMonth,
  tasks,
  loading,
  busy,
  truncated,
  today,
  projects,
  project,
  onProject,
  onNew,
  renderTask,
}) {
  const [selected, setSelected] = useState(
    today.startsWith(month) ? today : month + '-01',
  );
  const [includeDone, setIncludeDone] = useState(false);
  useEffect(() => {
    setSelected(today.startsWith(month) ? today : month + '-01');
  }, [month, today]);
  const visible = includeDone ? tasks : tasks.filter((task) => task.status !== 'done');
  const grouped = new Map();
  for (const task of visible) {
    const day = grouped.get(task.due) ?? [];
    day.push(task);
    grouped.set(task.due, day);
  }
  const selectedTasks = grouped.get(selected) ?? [];
  const previous = moveMonth(month, -1);
  const next = moveMonth(month, 1);
  return (
    <section aria-labelledby="calendar-heading" aria-busy={loading}>
      <div className="calendar-toolbar">
        <div>
          <h2 id="calendar-heading">Your deadline calendar</h2>
          <p className="small muted">
            Select a day to see its tasks or plan a new one. Undated tasks stay on the
            board.
          </p>
        </div>
        <div className="calendar-controls">
          <button
            type="button"
            className="secondary icon-button"
            aria-label="Previous month"
            disabled={!previous || busy}
            onClick={() => onMonth(previous)}
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            <span className="sr-only">Calendar month</span>
            <input
              type="month"
              aria-label="Calendar month"
              min="2000-01"
              max="2100-12"
              value={month}
              disabled={busy}
              onChange={(event) => {
                if (
                  /^\d{4}-\d{2}$/.test(event.target.value) &&
                  event.target.validity.valid
                )
                  onMonth(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="secondary icon-button"
            aria-label="Next month"
            disabled={!next || busy}
            onClick={() => onMonth(next)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => onMonth(today.slice(0, 7))}
          >
            This month
          </button>
        </div>
      </div>
      <div className="calendar-options">
        <label>
          <span className="sr-only">Calendar project</span>
          <select
            aria-label="Calendar project"
            value={project}
            disabled={busy}
            onChange={(event) => onProject(event.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="calendar-checkbox">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(event) => setIncludeDone(event.target.checked)}
          />{' '}
          Show completed tasks
        </label>
        <span className="small muted" role="status">
          {loading ? 'Loading deadlines…' : visible.length + ' dated tasks in this month'}
        </span>
      </div>
      {truncated && (
        <p className="error-banner" role="status">
          This month has more than 1,000 tasks. Showing the first 1,000. Filter by project
          to narrow the calendar.
        </p>
      )}
      <table className="deadline-calendar">
        <caption>{dateLabel(month + '-01', { month: 'long', year: 'numeric' })}</caption>
        <thead>
          <tr>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <th scope="col" key={day}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendarWeeks(month).map((week, index) => (
            <tr key={index}>
              {week.map((day, column) => (
                <td key={day ?? 'blank-' + column}>
                  {day && (
                    <button
                      type="button"
                      disabled={loading || busy}
                      aria-pressed={day === selected}
                      aria-current={day === today ? 'date' : undefined}
                      aria-label={
                        dateLabel(day, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        }) +
                        ', ' +
                        (grouped.get(day)?.length ?? 0) +
                        ((grouped.get(day)?.length ?? 0) === 1 ? ' task' : ' tasks')
                      }
                      onClick={() => setSelected(day)}
                    >
                      <span>{Number(day.slice(8))}</span>
                      {!loading && grouped.has(day) && (
                        <small>
                          {grouped.get(day).length}
                          <span className="sr-only"> tasks</span>
                        </small>
                      )}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="calendar-agenda">
        <div className="calendar-toolbar">
          <h3>
            {dateLabel(selected, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => onNew(selected)}
          >
            <Plus size={15} aria-hidden="true" /> Add task for this day
          </button>
        </div>
        {loading ? (
          <p role="status">Loading tasks…</p>
        ) : selectedTasks.length ? (
          <ul className="task-list" aria-label="Tasks for selected day">
            {selectedTasks.map((task) => (
              <li key={task.id}>{renderTask(task)}</li>
            ))}
          </ul>
        ) : (
          <div className="board-empty list-empty">
            <p>
              No {includeDone ? '' : 'unfinished '}tasks due on this day. A little space
              to plan ahead.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
