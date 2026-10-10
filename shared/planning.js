// Dates stay as calendar dates: no timezone shifts when selecting a day.
export function addDays(date, days) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function matchesPlanningView(task, view, date) {
  if (view === 'archived') return task.lifecycle === 'archived';
  if (view === 'trash') return task.lifecycle === 'trashed';
  if (task.lifecycle && task.lifecycle !== 'active') return false;
  if (view === 'all' || view === 'projects' || view === 'focus') return true;
  if (view === 'attention') return attentionReasons(task, date).length > 0;
  if (view === 'blocked') return task.status === 'blocked';
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
      unlinked: 0,
      completed: 0,
      active: 0,
      blocked: 0,
      overdue: 0,
      nextDue: null,
    };
    summary.total++;
    if (!task.projectId) summary.unlinked++;
    if (task.status === 'done') summary.completed++;
    if (task.status === 'progress') summary.active++;
    if (task.status === 'blocked') summary.blocked++;
    if (task.status !== 'done' && task.due) {
      if (task.due < date) summary.overdue++;
      if (!summary.nextDue || task.due < summary.nextDue) summary.nextDue = task.due;
    }
    projects.set(task.project, summary);
  }
  return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function attentionReasons(task, date) {
  if ((task.lifecycle && task.lifecycle !== 'active') || task.status === 'done')
    return [];
  const reasons = [];
  if (task.status === 'blocked') reasons.push('Blocked');
  if (task.due && task.due < date) reasons.push('Overdue');
  else if (task.due === date) reasons.push('Due today');
  else if (task.due && task.due <= addDays(date, 3)) reasons.push('Due within 3 days');
  if (task.priority === 'high') reasons.push('High priority');
  return reasons;
}
