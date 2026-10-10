import { validDate } from './date.js';
import { addDays } from './planning.js';
export function weekBounds(date) {
  if (!date || !validDate(date)) throw new Error('Choose a valid week date.');
  const day = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const monday = addDays(date, -day);
  return {
    start: monday < '2000-01-01' ? '2000-01-01' : monday,
    end: addDays(monday, 6) > '2100-12-31' ? '2100-12-31' : addDays(monday, 6),
  };
}
export function validWorkLog(log) {
  return (
    log &&
    typeof log.activity === 'string' &&
    log.activity.trim().length > 0 &&
    log.activity.length <= 120 &&
    typeof log.project === 'string' &&
    log.project.trim().length > 0 &&
    log.project.length <= 60 &&
    typeof log.date === 'string' &&
    log.date !== '' &&
    validDate(log.date) &&
    Number.isInteger(log.minutes) &&
    log.minutes >= 1 &&
    log.minutes <= 1440 &&
    typeof log.notes === 'string' &&
    log.notes.length <= 500
  );
}
export function loggedTime(minutes) {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? hours + 'h' + (rest ? ' ' + rest + 'm' : '') : rest + 'm';
}
