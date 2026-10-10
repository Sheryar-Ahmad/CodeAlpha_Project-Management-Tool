export function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadTaskExport(data) {
  downloadFile(
    JSON.stringify(data, null, 2),
    'orbit-' + data.scope + '-tasks-' + data.exportedAt.slice(0, 10) + '.json',
    'application/json',
  );
}
export function downloadCalendarExport(data) {
  downloadFile(
    data.calendar,
    'orbit-deadlines-' + new Date().toISOString().slice(0, 10) + '.ics',
    'text/calendar;charset=utf-8',
  );
}
