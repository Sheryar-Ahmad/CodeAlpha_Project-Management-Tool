import { randomUUID } from 'node:crypto';
import { nextRecurringDraft } from '../../shared/recurrence.js';
import { Task } from '../models/Task.js';

export async function ensureNextOccurrence(task) {
  // A deliberately deleted successor must not reappear on a completion retry.
  if (task.repeatNext)
    return Task.findOne({ _id: task.repeatNext, owner: task.owner }).lean();
  const draft = nextRecurringDraft(task, randomUUID);
  if (!draft) return null;
  // The unique source index makes completion retries and concurrent requests idempotent.
  await Task.init();
  const filter = { repeatSource: task._id, owner: task.owner };
  let nextTask;
  try {
    nextTask = await Task.findOneAndUpdate(
      filter,
      { $setOnInsert: { ...draft, owner: task.owner } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    nextTask = await Task.findOne(filter).lean();
  }
  if (nextTask)
    await Task.updateOne(
      { _id: task._id, owner: task.owner },
      { $set: { repeatNext: nextTask._id } },
    );
  return nextTask;
}
