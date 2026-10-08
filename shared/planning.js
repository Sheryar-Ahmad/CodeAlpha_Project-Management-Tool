// Dates stay as calendar dates: no timezone shifts when selecting a day.
export function addDays(date, days) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function matchesPlanningView(task, view, date) {
  if (view === 'all' || view === 'projects' || view === 'focus') return true;
  if (task.status === 'done' || !task.due) return false;
  return view === 'today'
    ? task.due <= date
    : task.due > date && task.due <= addDays(date, 7);
}
export function summarizeProjects(tasks, date) {
  const projects = new Map();
  for (const task of tasks) {
    const summary = projects.get(task.project) ?? {
      name: task.project,
      total: 0,
      completed: 0,
      active: 0,
      overdue: 0,
      nextDue: null,
    };
    summary.total++;
    if (task.status === 'done') summary.completed++;
    if (task.status === 'progress') summary.active++;
    if (task.status !== 'done' && task.due) {
      if (task.due < date) summary.overdue++;
      if (!summary.nextDue || task.due < summary.nextDue) summary.nextDue = task.due;
    }
    projects.set(task.project, summary);
  }
  return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}
