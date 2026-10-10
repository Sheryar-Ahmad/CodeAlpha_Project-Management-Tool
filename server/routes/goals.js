import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { parse } from '../lib/validation.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';
import { ProjectGoal } from '../models/ProjectGoal.js';
import { validDate } from '../../shared/date.js';
import { goalProgress } from '../../shared/goals.js';
export const goalsRouter = Router({ mergeParams: true });
goalsRouter.use(requireProjectAccess);
const measure = z.number().min(-1000000000).max(1000000000);
const fields = {
  title: z.string().trim().min(1).max(120),
  due: z.string().refine(validDate).default(''),
  results: z
    .array(
      z
        .object({
          id: z.string().min(1).max(100),
          title: z.string().trim().min(1).max(120),
          unit: z.string().trim().max(30).default(''),
          baseline: measure,
          current: measure,
          target: measure,
        })
        .strict(),
    )
    .min(1)
    .max(8)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
};
const createSchema = z.object(fields).strict();
const updateSchema = z.object({ ...fields, revision: z.number().int().min(0) }).strict();
const querySchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
const scope = (req) => ({ project: req.sharedProject._id });
const editScope = (req) => ({
  ...scope(req),
  ...(req.projectRole === 'owner' ? {} : { createdBy: req.user._id }),
});
const serialize = (item, req) => ({
  id: String(item._id),
  title: item.title,
  due: item.due,
  revision: item.revision,
  results: item.results.map(({ id, title, unit, baseline, current, target }) => ({
    id,
    title,
    unit,
    baseline,
    current,
    target,
  })),
  progress: goalProgress(item.results),
  canEdit: req.projectRole === 'owner' || String(item.createdBy) === String(req.user._id),
});
goalsRouter.get('/', async (req, res) => {
  const { page } = parse(querySchema, req.query);
  const goals = await ProjectGoal.find(scope(req))
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * 20)
    .limit(21)
    .lean();
  res.json({
    goals: goals.slice(0, 20).map((item) => serialize(item, req)),
    page,
    hasMore: goals.length > 20,
  });
});
goalsRouter.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  const goal = await ProjectGoal.create({
    ...data,
    ...scope(req),
    createdBy: req.user._id,
  });
  res.status(201).json({ goal: serialize(goal, req) });
});
goalsRouter.param('goalId', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid goal ID.' });
  next();
});
goalsRouter.patch('/:goalId', async (req, res) => {
  const { revision, ...data } = parse(updateSchema, req.body);
  const goal = await ProjectGoal.findOneAndUpdate(
    { _id: req.params.goalId, ...editScope(req), revision },
    { $set: data, $inc: { revision: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!goal) {
    if (await ProjectGoal.exists({ _id: req.params.goalId, ...editScope(req) }))
      return res
        .status(409)
        .json({ message: 'This goal changed. Refresh before editing again.' });
    return res.status(404).json({ message: 'Goal not found.' });
  }
  res.json({ goal: serialize(goal, req) });
});
goalsRouter.delete('/:goalId', async (req, res) => {
  const { revision } = parse(
    z.object({ revision: z.number().int().min(0) }).strict(),
    req.body,
  );
  const result = await ProjectGoal.deleteOne({
    _id: req.params.goalId,
    ...editScope(req),
    revision,
  });
  if (!result.deletedCount)
    return res
      .status(409)
      .json({ message: 'Goal unavailable or changed. Refresh before removing it.' });
  res.status(204).end();
});
