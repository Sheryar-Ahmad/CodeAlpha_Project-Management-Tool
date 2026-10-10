import { addDays } from './planning.js';
import { validDate } from './date.js';
// Earliest-start planning assumes calendar days and unlimited parallel capacity.
export function planDependencies(tasks, edges, startDate) {
  if (!startDate || !validDate(startDate))
    throw new Error('Choose a valid schedule start date.');
  const all = new Map(tasks.map((task) => [task.id, task]));
  const eligible = tasks.filter(
    (task) => task.status !== 'done' && (task.recurrence ?? 'none') === 'none',
  );
  const ids = new Set(eligible.map((task) => task.id)),
    incoming = new Map(),
    children = new Map();
  for (const task of eligible) {
    incoming.set(task.id, 0);
    children.set(task.id, []);
  }
  for (const edge of edges) {
    if (!ids.has(edge.to)) continue;
    const prerequisite = all.get(edge.from);
    if (!prerequisite)
      throw new Error(
        'A prerequisite is unavailable. Remove stale links before scheduling.',
      );
    if (prerequisite.status === 'done') continue;
    if (!ids.has(edge.from))
      throw new Error('A repeating prerequisite needs manual scheduling.');
    incoming.set(edge.to, incoming.get(edge.to) + 1);
    children.get(edge.from).push(edge.to);
  }
  const starts = new Map(eligible.map((task) => [task.id, startDate])),
    finishes = new Map();
  const queue = eligible
    .filter((task) => incoming.get(task.id) === 0)
    .map((task) => task.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index],
      task = all.get(id),
      start = starts.get(id);
    const end = addDays(start, (task.durationDays ?? 1) - 1);
    if (!validDate(start) || !validDate(end))
      throw new Error('This schedule exceeds the supported year 2100.');
    finishes.set(id, end);
    for (const child of children.get(id)) {
      const next = addDays(end, 1);
      if (next > starts.get(child)) starts.set(child, next);
      incoming.set(child, incoming.get(child) - 1);
      if (incoming.get(child) === 0) queue.push(child);
    }
  }
  if (queue.length !== eligible.length)
    throw new Error('Dependencies contain a circular chain.');
  return eligible.map((task) => ({
    id: task.id,
    title: task.title,
    oldDue: task.due ?? '',
    newDue: finishes.get(task.id),
    start: starts.get(task.id),
    expectedUpdatedAt: task.updatedAt,
  }));
}
