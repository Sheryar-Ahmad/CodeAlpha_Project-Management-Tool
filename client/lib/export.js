export function downloadTaskExport(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    'orbit-' + data.scope + '-tasks-' + data.exportedAt.slice(0, 10) + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
