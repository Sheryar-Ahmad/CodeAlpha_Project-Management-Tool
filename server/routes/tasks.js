import { Router } from 'express';
import mongoose from 'mongoose';
import { addDays } from '../../shared/planning.js';
import { Task } from '../models/Task.js';
import { requireAuth } from '../middleware/auth.js';
import {
  parse,
  taskSchema,
  taskUpdateSchema,
  querySchema,
  validDate,
} from '../lib/validation.js';
export const taskRouter = Router();
taskRouter.use(requireAuth);
const serialize = (task) => ({
  id: String(task._id),
  title: task.title,
  project: task.project,
  description: task.description,
  priority: task.priority,
  status: task.status,
  due: task.due,
  updatedAt: task.updatedAt,
  checklist: (task.checklist ?? []).map((item) => ({
    id: item.id,
    text: item.text,
    done: item.done,
  })),
});
taskRouter.get('/overview', async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (!date || !validDate(date))
    return res.status(400).json({ message: 'A valid local date is required.' });
  const owner = req.user._id;
  const [total, active, completed, overdue, projects] = await Promise.all([
    Task.countDocuments({ owner }),
    Task.countDocuments({ owner, status: 'progress' }),
    Task.countDocuments({ owner, status: 'done' }),
    Task.countDocuments({ owner, status: { $ne: 'done' }, due: { $ne: '', $lt: date } }),
    Task.aggregate([
      { $match: { owner } },
      {
        $group: {
          _id: '$project',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          active: { $sum: { $cond: [{ $eq: ['$status', 'progress'] }, 1, 0] } },
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
    projects: projects.map((project) => project._id),
    projectSummaries: projects.map(({ _id, ...summary }) => ({ name: _id, ...summary })),
  });
});
taskRouter.get('/', async (req, res) => {
  const { page, limit, search, project, view, date } = parse(querySchema, req.query);
  const filter = { owner: req.user._id };
  if (project) filter.project = project;
  if (view !== 'all') {
    filter.status = { $ne: 'done' };
    filter.due =
      view === 'today' ? { $ne: '', $lte: date } : { $gt: date, $lte: addDays(date, 7) };
  }
  if (search) {
    const specials = '.*+?^$' + '{}()|[]' + String.fromCharCode(92);
    const safe = [...search]
      .map((char) => (specials.includes(char) ? String.fromCharCode(92) + char : char))
      .join('');
    filter.$or = ['title', 'project', 'description'].map((field) => ({
      [field]: { $regex: safe, $options: 'i' },
    }));
  }
  const tasks = await Task.find(filter)
    .sort(view === 'all' ? { updatedAt: -1, _id: -1 } : { due: 1, _id: -1 })
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
  const task = await Task.create({ ...data, owner: req.user._id });
  res.status(201).json({ task: serialize(task) });
});
taskRouter.param('id', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid task ID.' });
  next();
});
taskRouter.patch('/:id', async (req, res) => {
  const data = parse(taskUpdateSchema, req.body);
  // Include ownership in the query; never trust a client-supplied owner.
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  res.json({ task: serialize(task) });
});
taskRouter.delete('/:id', async (req, res) => {
  const result = await Task.deleteOne({ _id: req.params.id, owner: req.user._id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Task not found.' });
  res.status(204).end();
});
