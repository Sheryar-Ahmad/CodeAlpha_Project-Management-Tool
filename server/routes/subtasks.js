import { Router } from 'express';
import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { taskScope } from '../middleware/projectAccess.js';
import { parse, taskSchema } from '../lib/validation.js';
import { serializeTask } from '../lib/serializeTask.js';
import { familyFields, familyVersion, familyFence } from '../lib/taskFamily.js';
import { taskActivity, appendActivity } from '../lib/taskActivity.js';
export const subtaskRouter = Router({ mergeParams: true });
const createSchema = z.object({ key: z.string().uuid(), task: taskSchema }).strict();
const active = (task) => !task.lifecycle || task.lifecycle === 'active';
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
async function currentTask(req) {
  const task = await Task.findOne({ _id: req.params.id, ...taskScope(req) })
    .select(familyFields)
    .lean();
  if (!task) throw fail('Task not found.', 404);
  return task;
}
function validParent(task) {
  if (task.parentTask)
    throw fail('Only one level of subtasks is supported. Open the parent task.');
  if (!active(task)) throw fail('Restore the parent before creating subtasks.');
  if (!task.projectId) throw fail('Connect this task to its project in Projects first.');
  if (task.recurrence && task.recurrence !== 'none')
    throw fail(
      'Recurring tasks cannot contain subtasks. Use checklist steps for a recurring workflow.',
    );
}
async function finishSetup(req, root) {
  const job = root.subtaskPending;
  if (!job) throw fail('No pending subtask setup.');
  const worker = randomUUID();
  // A short worker lease avoids parallel upserts. The persistent reservation survives
  // a stopped process and holds the parent in its project until setup is repaired.
  const claimed = await Task.findOneAndUpdate(
    {
      _id: root._id,
      owner: root.owner,
      projectId: root.projectId,
      'subtaskPending.key': job.key,
      'subtaskPending.workerUntil': { $lte: new Date() },
    },
    {
      $set: {
        'subtaskPending.worker': worker,
        'subtaskPending.workerUntil': new Date(Date.now() + 60000),
      },
    },
    { returnDocument: 'after' },
  )
    .select(familyFields)
    .lean();
  if (!claimed) throw fail('Subtask setup is running. Refresh or retry in one minute.');
  try {
    const draft = parse(taskSchema, job.draft);
    await Task.updateOne(
      { _id: job.task, owner: root.owner, parentTask: root._id },
      {
        $setOnInsert: {
          ...draft,
          owner: root.owner,
          projectId: root.projectId,
          parentTask: root._id,
          activity: [taskActivity(req.user, 'Created subtask')],
        },
      },
      { upsert: true, runValidators: true },
    );
    const result = await Task.updateOne(
      {
        _id: root._id,
        owner: root.owner,
        'subtaskPending.key': job.key,
        'subtaskPending.worker': worker,
      },
      {
        $set: { subtaskPending: null },
        $inc: { familyRevision: 1 },
        $push: appendActivity(taskActivity(req.user, 'Added subtask')),
      },
    );
    if (!result.modifiedCount)
      throw fail('Setup changed. Refresh to check the saved subtask.');
    return Task.findOne({
      _id: job.task,
      owner: root.owner,
      parentTask: root._id,
      projectId: root.projectId,
    }).lean();
  } finally {
    await Task.updateOne(
      { _id: root._id, 'subtaskPending.worker': worker },
      {
        $set: { 'subtaskPending.worker': '', 'subtaskPending.workerUntil': new Date(0) },
      },
    );
  }
}
subtaskRouter.post('/', async (req, res) => {
  const { key, task: data } = parse(createSchema, req.body);
  if (data.status !== 'blocked') data.blockerReason = '';
  let root = await currentTask(req);
  validParent(root);
  if (data.project !== root.project || data.recurrence !== 'none')
    throw fail('Subtasks stay in their parent project and do not repeat.', 400);
  const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const previous = (root.subtaskReceipts ?? []).find((item) => item.key === key);
  if (previous) {
    if (previous.digest !== digest)
      throw fail('This setup key was used for different content.');
    if (!root.subtaskPending || root.subtaskPending.key !== key) {
      const saved = await Task.findOne({
        _id: previous.task,
        owner: root.owner,
        parentTask: root._id,
        projectId: root.projectId,
      }).lean();
      return res.json({
        task: saved ? serializeTask(saved) : null,
        previouslyRemoved: !saved,
      });
    }
  } else {
    if (root.subtaskPending)
      throw fail('Resume the pending subtask setup before adding another.');
    if (
      (root.subtaskReceipts ?? []).length >= 200 ||
      (await Task.countDocuments({ owner: root.owner, parentTask: root._id })) >= 100
    )
      throw fail(
        'This parent supports 100 retained subtasks and 200 lifetime creation attempts.',
        400,
      );
    const id = new mongoose.Types.ObjectId();
    root = await Task.findOneAndUpdate(
      {
        _id: root._id,
        owner: root.owner,
        projectId: root.projectId,
        parentTask: null,
        lifecycle: { $in: ['active', null] },
        recurrence: { $in: ['none', null] },
        subtaskPending: null,
        ...familyVersion(root),
      },
      {
        $set: {
          subtaskPending: {
            key,
            task: id,
            draft: data,
            worker: '',
            workerUntil: new Date(0),
          },
        },
        $push: { subtaskReceipts: { key, task: id, digest } },
        $inc: { familyRevision: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    )
      .select(familyFields)
      .lean();
    if (!root) throw fail('The parent changed. Refresh before creating this subtask.');
  }
  const child = await finishSetup(req, root);
  res.status(201).json({ task: child ? serializeTask(child) : null });
});
subtaskRouter.post('/resume', async (req, res) => {
  parse(z.object({}).strict(), req.body);
  const root = await currentTask(req);
  validParent(root);
  const child = await finishSetup(req, root);
  res.json({ task: child ? serializeTask(child) : null });
});
subtaskRouter.patch('/detach', async (req, res) => {
  parse(z.object({}).strict(), req.body);
  const child = await currentTask(req);
  if (!child.parentTask || !active(child))
    throw fail('Choose an active subtask to detach.');
  const fence = await familyFence(child);
  const saved = await Task.findOneAndUpdate(
    {
      _id: child._id,
      ...taskScope(req),
      parentTask: child.parentTask,
      lifecycle: { $in: ['active', null] },
      ...fence,
    },
    {
      $set: { parentTask: null },
      $inc: { familyRevision: 1 },
      $push: appendActivity(taskActivity(req.user, 'Detached from parent')),
    },
    { returnDocument: 'after' },
  ).lean();
  if (!saved) throw fail('Subtask changed. Refresh and try again.');
  await Task.updateOne(
    { _id: child.parentTask, owner: child.owner },
    { $inc: { familyRevision: 1 } },
  );
  res.json({ task: serializeTask(saved) });
});

// Details are read on demand; normal board pages do not load history or child lists.
export async function taskDetails(req, res) {
  const page = parse(
    z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict(),
    req.query,
  ).page;
  const task = await Task.findOne({ _id: req.params.id, ...taskScope(req) })
    .select(familyFields + ' +activity')
    .lean();
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  const scope = { owner: task.owner, projectId: task.projectId };
  const children = task.parentTask
    ? []
    : await Task.find({ ...scope, parentTask: task._id })
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * 30)
        .limit(31)
        .lean();
  const parent = task.parentTask
    ? await Task.findOne({ _id: task.parentTask, ...scope })
        .select('title')
        .lean()
    : null;
  const members = task.projectId
    ? await ProjectMember.find({
        project: task.projectId,
        status: 'active',
        role: { $in: ['member', null] },
      })
        .select('user')
        .limit(100)
        .lean()
    : [];
  const people = await User.find({
    _id: { $in: [task.owner, ...members.map((item) => item.user)] },
    deleting: { $ne: true },
  })
    .select('name')
    .lean();
  res.json({
    task: serializeTask(task),
    parent: parent ? { id: String(parent._id), title: parent.title } : null,
    children: children.slice(0, 30).map(serializeTask),
    hasMore: children.length > 30,
    people: people.map((item) => ({ id: String(item._id), name: item.name })),
    pending: task.subtaskPending
      ? { title: task.subtaskPending.draft?.title ?? 'Subtask setup' }
      : null,
    activity: (task.activity ?? [])
      .slice(-50)
      .reverse()
      .map((item) => ({
        name: item.name,
        action: item.action,
        fields: item.fields,
        at: item.at,
      })),
  });
}
