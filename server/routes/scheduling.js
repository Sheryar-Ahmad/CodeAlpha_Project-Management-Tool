import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { parse } from '../lib/validation.js';
import {
  requireProjectAccess,
  requireProjectOwner,
  taskScope,
} from '../middleware/projectAccess.js';
import { MongoRateStore } from '../lib/rateStore.js';
import { Task } from '../models/Task.js';
import { ProjectDependencies } from '../models/ProjectDependencies.js';
import { ProjectSchedule } from '../models/ProjectSchedule.js';
import { planDependencies } from '../../shared/scheduling.js';
import { validDate } from '../../shared/date.js';
export const schedulingRouter = Router({ mergeParams: true });
schedulingRouter.use(requireProjectAccess, requireProjectOwner);
const limit = rateLimit({
  windowMs: 3600000,
  limit: 30,
  keyGenerator: (req) => String(req.user._id),
  store: new MongoRateStore('schedule-preview'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const serialize = (plan) => ({
  id: String(plan._id),
  rows: plan.rows.map((row) => ({
    id: String(row.task),
    title: row.title,
    start: row.start,
    oldDue: row.oldDue,
    newDue: row.newDue,
    state: row.state,
  })),
  expiresAt: plan.expiresAt,
  pending: plan.rows.filter((row) => row.state === 'pending').length,
  conflicts: plan.rows.filter((row) => row.state === 'conflict').length,
});
schedulingRouter.post('/preview', limit, async (req, res) => {
  const { startDate } = parse(
    z.object({ startDate: z.string().min(1).refine(validDate) }).strict(),
    req.body,
  );
  const [tasks, graph] = await Promise.all([
    Task.find({ ...taskScope(req), lifecycle: { $in: ['active', null] } })
      .select('title due status recurrence durationDays updatedAt')
      .sort({ _id: 1 })
      .limit(201)
      .lean(),
    ProjectDependencies.findOne({ project: req.sharedProject._id }).lean(),
  ]);
  if (tasks.length > 200)
    return res
      .status(413)
      .json({ message: 'Schedule preview supports up to 200 active project tasks.' });
  let rows;
  try {
    rows = planDependencies(
      tasks.map((task) => ({ ...task, id: String(task._id) })),
      (graph?.edges ?? []).map((edge) => ({
        from: String(edge.from),
        to: String(edge.to),
      })),
      startDate,
    );
  } catch (error) {
    return res.status(409).json({ message: error.message });
  }
  const plan = await ProjectSchedule.create({
    project: req.sharedProject._id,
    createdBy: req.user._id,
    graphRevision: graph?.revision ?? 0,
    rows: rows.map(({ id, ...row }) => ({ ...row, task: id })),
  });
  res.status(201).json({ plan: serialize(plan.toObject()) });
});
schedulingRouter.post('/:planId/apply', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.planId))
    return res.status(400).json({ message: 'Invalid schedule preview ID.' });
  parse(z.object({}).strict(), req.body ?? {});
  const filter = {
    _id: req.params.planId,
    project: req.sharedProject._id,
    createdBy: req.user._id,
    expiresAt: { $gt: new Date() },
  };
  const plan = await ProjectSchedule.findOneAndUpdate(
    { ...filter, lockedUntil: { $lte: new Date() } },
    { $set: { lockedUntil: new Date(Date.now() + 30000) } },
    { returnDocument: 'after' },
  ).lean();
  if (!plan)
    return res.status(409).json({
      message: 'Preview expired, unavailable or applying. Refresh and try again.',
    });
  try {
    const graph = await ProjectDependencies.findOne({ project: req.sharedProject._id })
      .select('revision')
      .lean();
    if ((graph?.revision ?? 0) !== plan.graphRevision)
      return res.status(409).json({
        message:
          'Dependencies changed. Create a new preview. Dates already saved remain.',
      });
    // Persist each result so a timeout can resume without overwriting subsequent user edits.
    const pending = plan.rows
      .map((row, index) => ({ ...row, index }))
      .filter((row) => row.state === 'pending')
      .slice(0, 25);
    for (const row of pending) {
      const scope = {
        _id: row.task,
        ...taskScope(req),
        lifecycle: { $in: ['active', null] },
        status: { $ne: 'done' },
        recurrence: { $in: ['none', null] },
      };
      const saved =
        row.expectedUpdatedAt && !Number.isNaN(new Date(row.expectedUpdatedAt).getTime())
          ? await Task.findOneAndUpdate(
              {
                ...scope,
                due: row.oldDue === '' ? { $in: ['', null] } : row.oldDue,
                updatedAt: row.expectedUpdatedAt,
              },
              { $set: { due: row.newDue, repeatDay: Number(row.newDue.slice(8)) } },
              { returnDocument: 'after' },
            )
              .select('_id')
              .lean()
          : null;
      const unchanged = !saved && (await Task.exists({ ...scope, due: row.newDue }));
      await ProjectSchedule.updateOne(filter, {
        $set: {
          ['rows.' + row.index + '.state']: saved || unchanged ? 'saved' : 'conflict',
        },
      });
    }
    const updated = await ProjectSchedule.findOne(filter).lean();
    if (!updated)
      return res.status(409).json({
        message:
          'The schedule preview expired. Saved dates remain; create a new preview to continue.',
      });
    const latestGraph = await ProjectDependencies.findOne({
      project: req.sharedProject._id,
    })
      .select('revision')
      .lean();
    res.json({
      plan: serialize(updated),
      graphChanged: (latestGraph?.revision ?? 0) !== plan.graphRevision,
    });
  } finally {
    await ProjectSchedule.updateOne(filter, { $set: { lockedUntil: new Date(0) } });
  }
});
