import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { parse } from '../lib/validation.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { ProjectCapacity } from '../models/ProjectCapacity.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { validDate } from '../../shared/date.js';
import { weekBounds } from '../../shared/workLog.js';

export const workloadRouter = Router({ mergeParams: true });
workloadRouter.use(requireProjectAccess);
const date = z.string().min(1).refine(validDate, 'Choose a valid week date.');
const querySchema = z.object({ date }).strict();
const capacitySchema = z
  .object({
    date,
    user: z.string().refine(mongoose.isObjectIdOrHexString),
    minutes: z.number().int().min(0).max(10080).nullable(),
  })
  .strict();

workloadRouter.get('/', async (req, res) => {
  const week = weekBounds(parse(querySchema, req.query).date);
  const project = req.sharedProject;
  const [members, owner, budgets, groups] = await Promise.all([
    ProjectMember.find({
      project: project._id,
      status: 'active',
      role: { $in: ['member', null] },
    })
      .sort({ createdAt: 1 })
      .limit(101)
      .populate('user', 'name')
      .lean(),
    User.findById(project.owner).select('name').lean(),
    ProjectCapacity.find({ project: project._id, week: week.start }).lean(),
    // Include overdue carry-in and this week's deadlines; undated backlog is shown separately.
    Task.aggregate([
      {
        $match: {
          owner: project.owner,
          projectId: project._id,
          lifecycle: { $in: ['active', null] },
          status: { $ne: 'done' },
          $or: [{ due: { $lte: week.end } }, { due: null }],
        },
      },
      {
        $group: {
          _id: '$assignee',
          tasks: { $sum: { $cond: [{ $gt: ['$due', ''] }, 1, 0] } },
          minutes: {
            $sum: {
              $cond: [{ $gt: ['$due', ''] }, { $ifNull: ['$estimateMinutes', 0] }, 0],
            },
          },
          unestimated: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$due', ''] },
                    { $lte: [{ $ifNull: ['$estimateMinutes', 0] }, 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          undated: { $sum: { $cond: [{ $gt: ['$due', ''] }, 0, 1] } },
        },
      },
    ]),
  ]);
  const people = [
    ...(owner ? [{ id: String(owner._id), name: owner.name }] : []),
    ...members
      .slice(0, 100)
      .filter((item) => item.user)
      .map((item) => ({ id: String(item.user._id), name: item.user.name })),
  ];
  const rows = people.map((person) => {
    const group = groups.find((item) => String(item._id) === person.id);
    const budget = budgets.find((item) => String(item.user) === person.id);
    return {
      ...person,
      tasks: group?.tasks ?? 0,
      minutes: group?.minutes ?? 0,
      unestimated: group?.unestimated ?? 0,
      undated: group?.undated ?? 0,
      capacity: budget?.minutes ?? null,
      canEdit: req.projectRole === 'owner' || person.id === String(req.user._id),
    };
  });
  const other = groups.filter(
    (item) => !people.some((person) => person.id === String(item._id)),
  );
  res.json({
    week,
    rows,
    truncated: members.length > 100,
    unassigned: other.filter((item) => !item._id).map(({ _id, ...rest }) => rest)[0] ?? {
      tasks: 0,
      minutes: 0,
      unestimated: 0,
      undated: 0,
    },
    otherAssignments: other
      .filter((item) => item._id)
      .reduce(
        (sum, item) => ({
          tasks: sum.tasks + item.tasks,
          minutes: sum.minutes + item.minutes,
          unestimated: sum.unestimated + item.unestimated,
          undated: sum.undated + item.undated,
        }),
        { tasks: 0, minutes: 0, unestimated: 0, undated: 0 },
      ),
  });
});
workloadRouter.patch('/capacity', async (req, res) => {
  const data = parse(capacitySchema, req.body),
    week = weekBounds(data.date);
  if (req.projectRole !== 'owner' && data.user !== String(req.user._id))
    return res
      .status(403)
      .json({ message: 'Set your own capacity, or ask the owner to update it.' });
  if (
    data.user !== String(req.sharedProject.owner) &&
    !(await ProjectMember.exists({
      project: req.sharedProject._id,
      user: data.user,
      status: 'active',
      role: { $in: ['member', null] },
    }))
  )
    return res.status(400).json({ message: 'Choose an active teammate.' });
  const filter = { project: req.sharedProject._id, user: data.user, week: week.start };
  if (data.minutes === null) await ProjectCapacity.deleteOne(filter);
  else {
    await ProjectCapacity.init();
    try {
      await ProjectCapacity.updateOne(
        filter,
        { $set: { minutes: data.minutes } },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await ProjectCapacity.updateOne(
        filter,
        { $set: { minutes: data.minutes } },
        { runValidators: true },
      );
    }
  }
  res.status(204).end();
});
