import { validDate } from './date.js';
const encoder = new TextEncoder();
const escapeText = (value) =>
  String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
const nextDate = (date) => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10).replaceAll('-', '');
};
function fold(line) {
  const lines = [];
  let current = '',
    bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = ' ';
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function calendarTasks(tasks) {
  return tasks.filter(
    (task) =>
      (task.lifecycle ?? 'active') === 'active' &&
      task.status !== 'done' &&
      task.due &&
      validDate(task.due),
  );
}
export function createCalendarExport(tasks, scope, stamp = new Date()) {
  const eligible = calendarTasks(tasks);
  const timestamp =
    stamp.toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Orbit//Deadline calendar//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const task of eligible)
    lines.push(
      'BEGIN:VEVENT',
      'UID:orbit-' +
        encodeURIComponent(scope) +
        '-' +
        encodeURIComponent(task.id) +
        '@orbit.local',
      'DTSTAMP:' + timestamp,
      'DTSTART;VALUE=DATE:' + task.due.replaceAll('-', ''),
      'DTEND;VALUE=DATE:' + nextDate(task.due),
      'SUMMARY:' + escapeText(task.title),
      'DESCRIPTION:' + escapeText(task.project + '\n' + task.description),
      'CLASS:PRIVATE',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  lines.push('END:VCALENDAR');
  return { calendar: lines.map(fold).join('\r\n') + '\r\n', count: eligible.length };
}
export function googleCalendarLink(task) {
  if (!task.due || !validDate(task.due)) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title,
    dates: task.due.replaceAll('-', '') + '/' + nextDate(task.due),
    details: task.project + '\n' + task.description,
  });
  return 'https://calendar.google.com/calendar/r/eventedit?' + params;
}
