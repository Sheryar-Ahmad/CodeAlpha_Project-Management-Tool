import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
export async function runProjectRules(
  project,
  date = new Date().toISOString().slice(0, 10),
) {
  if (
    !project.automation?.overdueHigh ||
    !(await User.exists({ _id: project.owner, deleting: { $ne: true } }))
  )
    return { changed: 0, hasMore: false };
  // Only known, overdue active unfinished tasks change. Each run is bounded and idempotent.
  const tasks = await Task.find({
    owner: project.owner,
    projectId: project._id,
    lifecycle: { $in: ['active', null] },
    status: { $ne: 'done' },
    priority: { $ne: 'high' },
    due: { $gt: '', $lt: date },
  })
    .sort({ due: 1, _id: 1 })
    .select('_id')
    .limit(101)
    .lean();
  const result = await Task.updateMany(
    {
      _id: { $in: tasks.slice(0, 100).map((task) => task._id) },
      owner: project.owner,
      projectId: project._id,
      lifecycle: { $in: ['active', null] },
      status: { $ne: 'done' },
      priority: { $ne: 'high' },
      due: { $gt: '', $lt: date },
    },
    { $set: { priority: 'high' } },
  );
  await Project.updateOne(
    { _id: project._id },
    { $set: { automationLastRunAt: new Date() } },
  );
  return { changed: result.modifiedCount, hasMore: tasks.length > 100 };
}
export async function runScheduledRules() {
  const projects = await Project.find({ 'automation.overdueHigh': true })
    .sort({ automationLastRunAt: 1, _id: 1 })
    .limit(10)
    .lean();
  let changed = 0;
  for (const project of projects) changed += (await runProjectRules(project)).changed;
  return { projects: projects.length, changed };
}
