import { monthBounds } from './calendar.js';
// A one-date project is a checkpoint; missing dates are never invented.
export function timelinePosition(project, month) {
  const range = monthBounds(month);
  const start = project.startDate || project.targetDate;
  const end = project.targetDate || project.startDate;
  if (!start || !end) return { kind: 'undated' };
  if (end < range.start || start > range.end) return { kind: 'outside' };
  const first = start < range.start ? 1 : Number(start.slice(8));
  const last = end > range.end ? Number(range.end.slice(8)) : Number(end.slice(8));
  const days = Number(range.end.slice(8));
  return {
    kind: start === end ? 'checkpoint' : 'span',
    left: ((first - 1) / days) * 100,
    width: ((last - first + 1) / days) * 100,
  };
}
