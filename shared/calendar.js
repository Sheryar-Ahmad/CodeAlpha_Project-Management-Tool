import { validDate } from './date.js';

// Calendar dates use UTC arithmetic so a timezone cannot move a deadline.
export function validMonth(month) {
  return (
    typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) && validDate(month + '-01')
  );
}
export function monthBounds(month) {
  if (!validMonth(month)) throw new Error('Choose a month between 2000 and 2100.');
  const start = month + '-01';
  const date = new Date(start + 'T12:00:00Z');
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}
export function moveMonth(month, offset) {
  const { start } = monthBounds(month);
  const date = new Date(start + 'T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  const next = date.toISOString().slice(0, 7);
  return validMonth(next) ? next : null;
}
export function calendarWeeks(month) {
  const { start, end } = monthBounds(month);
  const lead = (new Date(start + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const days = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= Number(end.slice(8)); day++)
    days.push(month + '-' + String(day).padStart(2, '0'));
  while (days.length % 7) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
}
