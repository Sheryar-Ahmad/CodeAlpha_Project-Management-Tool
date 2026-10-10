import { validNotebookEntry } from '../../shared/notebook.js';
const key = 'orbit.project-notes.v1';
function validRecords(entries) {
  return (
    Array.isArray(entries) &&
    entries.length <= 500 &&
    new Set(entries.map((entry) => entry?.id)).size === entries.length &&
    entries.every(
      (entry) =>
        validNotebookEntry(entry) &&
        typeof entry.id === 'string' &&
        entry.id.length > 0 &&
        entry.id.length <= 100 &&
        typeof entry.projectId === 'string' &&
        entry.projectId.length > 0 &&
        entry.projectId.length <= 100,
    )
  );
}
export function readDemoNotebook() {
  try {
    const entries = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!validRecords(entries)) throw new Error('Invalid entries');
    return entries;
  } catch {
    throw new Error('Local notebook could not be read. Reset the demo to recover.');
  }
}
export function saveDemoNotebook(entries) {
  if (!validRecords(entries))
    throw new Error('Check notebook fields. The demo supports up to 500 entries.');
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    throw new Error(
      'Notebook could not be saved. Browser storage may be disabled or full.',
    );
  }
}
