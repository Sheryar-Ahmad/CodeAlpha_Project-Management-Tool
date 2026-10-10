import { validWorkLog } from '../../shared/workLog.js';
const key = 'orbit.work-logs.v1';
function validRecords(logs) {
  return (
    Array.isArray(logs) &&
    logs.length <= 500 &&
    new Set(logs.map((log) => log?.id)).size === logs.length &&
    logs.every(
      (log) =>
        validWorkLog(log) &&
        typeof log.id === 'string' &&
        log.id.length > 0 &&
        log.id.length <= 100,
    )
  );
}
export function readDemoWorkLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!validRecords(logs)) throw new Error('Invalid work logs');
    return logs;
  } catch {
    throw new Error('Local work logs could not be read. Reset the demo to recover.');
  }
}
export function saveDemoWorkLogs(logs) {
  if (!validRecords(logs))
    throw new Error('Check work log fields. The demo supports up to 500 logs.');
  try {
    localStorage.setItem(key, JSON.stringify(logs));
  } catch {
    throw new Error(
      'Work logs could not be saved. Browser storage may be disabled or full.',
    );
  }
}
