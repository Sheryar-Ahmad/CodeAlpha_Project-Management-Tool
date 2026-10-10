import { validDate } from './date.js';
export const notebookKinds = {
  note: 'Project note',
  decision: 'Decision',
  meeting: 'Meeting',
};
export function validNotebookEntry(entry) {
  return (
    entry &&
    Object.hasOwn(notebookKinds, entry.kind) &&
    typeof entry.title === 'string' &&
    entry.title.trim().length > 0 &&
    entry.title.length <= 120 &&
    typeof entry.body === 'string' &&
    entry.body.trim().length > 0 &&
    entry.body.length <= 3000 &&
    typeof entry.date === 'string' &&
    entry.date !== '' &&
    validDate(entry.date)
  );
}
// Follow-ups stay editable; recording a meeting does not create surprise tasks.
export function meetingFollowUp(entry, project) {
  return {
    title: ('Follow up: ' + entry.title).slice(0, 120),
    project,
    description: entry.body.slice(0, 1000),
    notes: 'Meeting: ' + entry.title + ' (' + entry.date + ')',
    status: 'todo',
    priority: 'medium',
    due: '',
    recurrence: 'none',
    links: [],
    checklist: [],
  };
}
