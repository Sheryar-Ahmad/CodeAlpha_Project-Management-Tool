import { Task } from '../models/Task.js';
export const familyFields = '+familyRevision +subtaskPending +subtaskReceipts';
export function familyVersion(task) {
  return (task.familyRevision ?? 0) === 0
    ? { familyRevision: { $in: [0, null] } }
    : { familyRevision: task.familyRevision };
}
// A parent reservation and sensitive parent changes both advance this version.
// A creator cannot begin and finish unnoticed between a child check and a project move.
export async function familyFence(
  task,
  { moving = false, repeating = false, deleting = false } = {},
) {
  // Keep a child attached until interrupted setup has finalized its receipt.
  if (
    task.parentTask &&
    (await Task.exists({
      _id: task.parentTask,
      owner: task.owner,
      'subtaskPending.task': task._id,
    }))
  )
    throw Object.assign(new Error('Resume this subtask setup from its parent first.'), {
      status: 409,
    });
  if (task.parentTask && (moving || repeating))
    throw Object.assign(
      new Error('Detach this subtask before moving it or enabling recurrence.'),
      { status: 409 },
    );
  if (task.subtaskPending)
    throw Object.assign(
      new Error('Finish the pending subtask setup from Task details first.'),
      { status: 409 },
    );
  if (
    (moving || repeating || deleting) &&
    (await Task.exists({ owner: task.owner, parentTask: task._id }))
  )
    throw Object.assign(
      new Error(
        'Detach or permanently remove the subtasks first. No child tasks were changed.',
      ),
      { status: 409 },
    );
  return { ...familyVersion(task), subtaskPending: null };
}
