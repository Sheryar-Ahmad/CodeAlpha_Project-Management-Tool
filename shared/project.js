import { validDate } from './date.js';
export const projectStatuses = {
  planned: 'Planned',
  active: 'Active',
  onhold: 'On hold',
  completed: 'Completed',
};
export function validProjectDates(startDate, targetDate) {
  return (
    validDate(startDate) &&
    validDate(targetDate) &&
    (!startDate || !targetDate || startDate <= targetDate)
  );
}

// Empty projects stay visible; legacy task groups can gain details without rewriting tasks.
export function combineProjects(summaries, records) {
  const projects = new Map(summaries.map((summary) => [summary.name, { ...summary }]));
  for (const record of records) {
    const summary = projects.get(record.name) ?? {
      name: record.name,
      total: 0,
      unlinked: 0,
      completed: 0,
      active: 0,
      blocked: 0,
      overdue: 0,
      nextDue: null,
    };
    projects.set(record.name, { ...summary, ...record });
  }
  return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Shared validation keeps local demo records as strict as account records.
export function validMilestones(items) {
  return (
    Array.isArray(items) &&
    items.length <= 20 &&
    new Set(items.map((item) => item?.id)).size === items.length &&
    items.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 100 &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        item.title.length <= 120 &&
        typeof item.due === 'string' &&
        validDate(item.due) &&
        typeof item.done === 'boolean',
    )
  );
}
export function projectHealth(project, date) {
  const reasons = [];
  if (project.blocked > 0) reasons.push(project.blocked + ' blocked tasks');
  if (project.overdue > 0) reasons.push(project.overdue + ' overdue tasks');
  const missed = (project.milestones ?? []).filter(
    (item) => !item.done && item.due && item.due < date,
  ).length;
  if (missed) reasons.push(missed + ' overdue milestones');
  if (project.targetDate && project.targetDate < date && project.status !== 'completed')
    reasons.push('Project target date has passed');
  if (
    project.status === 'completed' &&
    (project.completed < project.total ||
      (project.milestones ?? []).some((item) => !item.done))
  )
    reasons.push('Marked complete with unfinished work');
  if (project.status === 'onhold') reasons.push('Project is on hold');
  return {
    label: reasons.length
      ? 'Needs attention'
      : project.total === 0 && !(project.milestones ?? []).length
        ? 'No work added yet'
        : 'No current flags',
    reasons,
  };
}
