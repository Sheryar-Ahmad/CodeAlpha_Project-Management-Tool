import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { MongoRateStore } from '../lib/rateStore.js';
import { createTaskExport } from '../../shared/export.js';
import { ensureNextOccurrence } from '../lib/recurrence.js';
import { addDays } from '../../shared/planning.js';
import { Task } from '../models/Task.js';
import { requireAuth } from '../middleware/auth.js';
import {
  parse,
  taskSchema,
  taskUpdateSchema,
  querySchema,
  validDate,
  lifecycleSchema,
} from '../lib/validation.js';
export const taskRouter = Router();
taskRouter.use(requireAuth);
// Missing lifecycle fields are older active records; no destructive migration is needed.
const activeRecords = { lifecycle: { $in: ['active', null] } };
const serialize = (task) => ({
  id: String(task._id),
  lifecycle: task.lifecycle ?? 'active',
  title: task.title,
  project: task.project,
  description: task.description,
  notes: task.notes ?? '',
  links: (task.links ?? []).map(({ label, url }) => ({ label, url })),
  priority: task.priority,
  status: task.status,
  blockerReason: task.blockerReason ?? '',
  due: task.due,
  recurrence: task.recurrence ?? 'none',
  repeatDay: task.repeatDay,
  repeatSource: task.repeatSource ? String(task.repeatSource) : undefined,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  checklist: (task.checklist ?? []).map((item) => ({
    id: item.id,
    text: item.text,
    done: item.done,
  })),
});
const exportLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => String(req.user._id),
  store: new MongoRateStore('task-export'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Export limit reached. Please try again in an hour.' },
});

taskRouter.get('/export', exportLimit, async (req, res) => {
  // One extra record detects oversize exports without loading an unbounded account.
  const tasks = await Task.find({ owner: req.user._id })
    .sort({ _id: 1 })
    .limit(1001)
    .lean();
  if (tasks.length > 1000)
    return res.status(413).json({
      message:
        'Exports currently support up to 1,000 tasks. Nothing has been downloaded.',
    });
  res.json(createTaskExport(tasks.map(serialize), 'account'));
});

taskRouter.get('/overview', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (!date || !validDate(date))
    return res.status(400).json({ message: 'A valid local date is required.' });
  const owner = req.user._id;
  const [total, active, completed, overdue, blocked, archived, trashed, projects] =
    await Promise.all([
      Task.countDocuments({ owner, ...activeRecords }),
      Task.countDocuments({ owner, ...activeRecords, status: 'progress' }),
      Task.countDocuments({ owner, ...activeRecords, status: 'done' }),
      Task.countDocuments({
        owner,
        ...activeRecords,
        status: { $ne: 'done' },
        due: { $ne: '', $lt: date },
      }),
      Task.countDocuments({ owner, ...activeRecords, status: 'blocked' }),
      Task.countDocuments({ owner, lifecycle: 'archived' }),
      Task.countDocuments({ owner, lifecycle: 'trashed' }),
      Task.aggregate([
        { $match: { owner, ...activeRecords } },
        {
          $group: {
            _id: '$project',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            active: { $sum: { $cond: [{ $eq: ['$status', 'progress'] }, 1, 0] } },
            blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'done'] },
                      { $ne: ['$due', ''] },
                      { $lt: ['$due', date] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            nextDue: {
              $min: {
                $cond: [
                  { $and: [{ $ne: ['$status', 'done'] }, { $ne: ['$due', ''] }] },
                  '$due',
                  null,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 1000 },
      ]),
    ]);
  res.json({
    total,
    active,
    completed,
    overdue,
    blocked,
    archived,
    trashed,
    projects: projects.map((project) => project._id),
    projectSummaries: projects.map(({ _id, ...summary }) => ({ name: _id, ...summary })),
  });
});
taskRouter.get('/', async (req, res) => {
  const { page, limit, search, project, view, date } = parse(querySchema, req.query);
  const filter = {
    owner: req.user._id,
    ...(view === 'archived'
      ? { lifecycle: 'archived' }
      : view === 'trash'
        ? { lifecycle: 'trashed' }
        : activeRecords),
  };
  if (project) filter.project = project;
  if (view === 'blocked') filter.status = 'blocked';
  else if (['today', 'upcoming'].includes(view)) {
    filter.status = { $ne: 'done' };
    filter.due =
      view === 'today' ? { $ne: '', $lte: date } : { $gt: date, $lte: addDays(date, 7) };
  }
  if (search) {
    const specials = '.*+?^$' + '{}()|[]' + String.fromCharCode(92);
    const safe = [...search]
      .map((char) => (specials.includes(char) ? String.fromCharCode(92) + char : char))
      .join('');
    filter.$or = ['title', 'project', 'description', 'notes', 'blockerReason'].map(
      (field) => ({
        [field]: { $regex: safe, $options: 'i' },
      }),
    );
  }
  const tasks = await Task.find(filter)
    .sort(
      ['today', 'upcoming'].includes(view)
        ? { due: 1, _id: -1 }
        : { updatedAt: -1, _id: -1 },
    )
    .skip((page - 1) * limit)
    .limit(limit + 1)
    .lean();
  res.json({
    tasks: tasks.slice(0, limit).map(serialize),
    hasMore: tasks.length > limit,
    page,
  });
});
taskRouter.post('/', async (req, res) => {
  const data = parse(taskSchema, req.body);
  if (data.status !== 'blocked') data.blockerReason = '';
  if (data.due) data.repeatDay = Number(data.due.slice(8));
  const task = await Task.create({ ...data, owner: req.user._id });
  const nextTask =
    task.status === 'done' && task.recurrence !== 'none'
      ? await ensureNextOccurrence(task.toObject())
      : null;
  res.status(201).json({
    task: serialize(task),
    ...(nextTask ? { nextTask: serialize(nextTask) } : {}),
  });
});
taskRouter.param('id', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid task ID.' });
  next();
});
taskRouter.patch('/:id', async (req, res) => {
  const data = parse(taskUpdateSchema, req.body);
  // Leaving Blocked clears the obsolete reason in the same write.
  if (data.status && data.status !== 'blocked') data.blockerReason = '';
  if (data.due) {
    const current = await Task.findOne({
      _id: req.params.id,
      owner: req.user._id,
      ...activeRecords,
    })
      .select('due repeatDay')
      .lean();
    if (!current) return res.status(404).json({ message: 'Task not found.' });
    // A full edit of an unchanged date must retain a January-31 monthly anchor.
    if (data.due !== current.due || !current.repeatDay)
      data.repeatDay = Number(data.due.slice(8));
  }
  // Include ownership in the query; never trust a client-supplied owner.
  const task = await Task.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: req.user._id,
      ...activeRecords,
      ...(data.due === '' && !data.recurrence
        ? { recurrence: { $in: ['none', null] } }
        : {}),
    },
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  const nextTask =
    data.status === 'done' && task.recurrence && task.recurrence !== 'none'
      ? await ensureNextOccurrence(task)
      : null;
  res.json({
    task: serialize(task),
    ...(nextTask ? { nextTask: serialize(nextTask) } : {}),
  });
});
// State transitions include the expected old state, keeping racing requests safe.
taskRouter.patch('/:id/lifecycle', async (req, res) => {
  const { action } = parse(lifecycleSchema, req.body);
  const from =
    action === 'archive'
      ? activeRecords
      : { lifecycle: action === 'unarchive' ? 'archived' : 'trashed' };
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, ...from },
    { $set: { lifecycle: action === 'archive' ? 'archived' : 'active' } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!task) return res.status(404).json({ message: 'Task not found in that state.' });
  res.json({ task: serialize(task) });
});

taskRouter.delete('/:id', async (req, res) => {
  const task = await Task.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: req.user._id,
      lifecycle: { $in: ['active', 'archived', null] },
    },
    { $set: { lifecycle: 'trashed' } },
    { returnDocument: 'after' },
  );
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  res.status(204).end();
});

taskRouter.delete('/:id/permanent', async (req, res) => {
  const result = await Task.deleteOne({
    _id: req.params.id,
    owner: req.user._id,
    lifecycle: 'trashed',
  });
  if (!result.deletedCount)
    return res.status(404).json({ message: 'Task not found in Trash.' });
  res.status(204).end();
});
