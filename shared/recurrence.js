import { addDays } from './planning.js';
import { validDate } from './date.js';
export const recurrenceLabels = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function nextRecurringDate(due, recurrence, anchorDay) {
  if (!due || !validDate(due) || recurrence === 'none') return null;
  let result;
  if (recurrence === 'daily' || recurrence === 'weekly')
    result = addDays(due, recurrence === 'daily' ? 1 : 7);
  else if (recurrence === 'monthly') {
    const date = new Date(due + 'T12:00:00Z');
    const year = date.getUTCFullYear();
    const nextMonth = date.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay || date.getUTCDate(), lastDay);
    result = new Date(Date.UTC(year, nextMonth, day, 12)).toISOString().slice(0, 10);
  }
  return result && validDate(result) ? result : null;
}

// Completion preserves the old occurrence; this builds an independent next task.
export function nextRecurringDraft(task, makeId) {
  const due = nextRecurringDate(task.due, task.recurrence, task.repeatDay);
  if (!due) return null;
  return {
    title: task.title,
    project: task.project,
    ...(task.projectId ? { projectId: task.projectId } : {}),
    description: task.description,
    notes: task.notes ?? '',
    links: (task.links ?? []).map(({ label, url }) => ({ label, url })),
    priority: task.priority,
    estimateMinutes: task.estimateMinutes ?? 0,
    durationDays: task.durationDays ?? 1,
    status: 'todo',
    blockerReason: '',
    due,
    recurrence: task.recurrence,
    repeatDay: task.repeatDay || Number(task.due.slice(8)),
    checklist: (task.checklist ?? []).map((step) => ({
      id: makeId(),
      text: step.text,
      done: false,
    })),
    lifecycle: 'active',
  };
}
