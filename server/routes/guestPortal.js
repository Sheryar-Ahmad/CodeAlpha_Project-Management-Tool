import { Router } from 'express';
import { z } from 'zod';
import { requireProjectAccess, taskScope } from '../middleware/projectAccess.js';
import { Task } from '../models/Task.js';
import { parse } from '../lib/validation.js';
export const guestPortalRouter = Router({ mergeParams: true });
guestPortalRouter.use((req, res, next) => {
  req.guestPortal = true;
  next();
}, requireProjectAccess);
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(120).default(''),
  })
  .strict();
guestPortalRouter.get('/', async (req, res) => {
  const { page, search } = parse(querySchema, req.query);
  const scope = { ...taskScope(req), lifecycle: { $in: ['active', null] } };
  const filter = { ...scope };
  if (search) {
    const specials = '.*+?^$' + '{}()|[]' + String.fromCharCode(92);
    const safe = [...search]
      .map((char) => (specials.includes(char) ? String.fromCharCode(92) + char : char))
      .join('');
    filter.title = { $regex: safe, $options: 'i' };
  }
  const [tasks, total, completed] = await Promise.all([
    Task.find(filter)
      .select('title description priority status due')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * 30)
      .limit(31)
      .lean(),
    Task.countDocuments(scope),
    Task.countDocuments({ ...scope, status: 'done' }),
  ]);
  const project = req.sharedProject;
  res.json({
    project: {
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate,
      targetDate: project.targetDate,
      milestones: (project.milestones ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        due: item.due,
        done: item.done,
      })),
    },
    total,
    completed,
    page,
    hasMore: tasks.length > 30,
    tasks: tasks.slice(0, 30).map((task) => ({
      id: String(task._id),
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due: task.due,
    })),
  });
});
