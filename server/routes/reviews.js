import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireProjectAccess, taskScope } from '../middleware/projectAccess.js';
import { Task } from '../models/Task.js';
import { TaskReview } from '../models/TaskReview.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { parse } from '../lib/validation.js';
export const reviewRouter = Router({ mergeParams: true });
reviewRouter.use(requireProjectAccess);
const objectId = z
  .string()
  .refine((value) => mongoose.isObjectIdOrHexString(value), 'Invalid ID.');
const requestSchema = z
  .object({
    task: objectId,
    reviewer: objectId,
    message: z.string().trim().max(500).default(''),
  })
  .strict();
const decisionSchema = z
  .object({
    action: z.enum(['approve', 'changes', 'cancel']),
    response: z.string().trim().max(500).default(''),
  })
  .strict()
  .refine(
    (value) => value.action !== 'changes' || value.response.length > 0,
    'Explain the requested changes.',
  );
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z.enum(['', 'pending', 'approved', 'changes', 'cancelled']).default(''),
  })
  .strict();
const person = (user) => (user ? { id: String(user._id), name: user.name } : null);
reviewRouter.get('/', async (req, res) => {
  const { page, status } = parse(querySchema, req.query);
  const reviews = await TaskReview.find({
    project: req.sharedProject._id,
    ...(status ? { status } : {}),
  })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * 20)
    .limit(21)
    .populate('requester', 'name')
    .populate('reviewer', 'name')
    .lean();
  res.json({
    reviews: reviews.slice(0, 20).map((item) => ({
      id: String(item._id),
      task: String(item.task),
      title: item.title,
      description: item.description,
      message: item.message,
      requester: person(item.requester),
      reviewer: person(item.reviewer),
      status: item.status,
      response: item.response,
      createdAt: item.createdAt,
      decidedAt: item.decidedAt,
      canDecide:
        item.status === 'pending' && String(item.reviewer?._id) === String(req.user._id),
      canCancel:
        item.status === 'pending' &&
        (req.projectRole === 'owner' ||
          String(item.requester?._id) === String(req.user._id)),
    })),
    hasMore: reviews.length > 20,
  });
});
reviewRouter.post('/', async (req, res) => {
  const data = parse(requestSchema, req.body);
  if (data.reviewer === String(req.user._id))
    return res
      .status(400)
      .json({ message: 'Choose another person to review your work.' });
  if (
    data.reviewer !== String(req.sharedProject.owner) &&
    !(await ProjectMember.exists({
      project: req.sharedProject._id,
      user: data.reviewer,
      status: 'active',
      role: { $in: ['member', null] },
    }))
  )
    return res
      .status(400)
      .json({ message: 'Choose the owner or an accepted project member.' });
  const task = await Task.findOne({
    _id: data.task,
    ...taskScope(req),
    lifecycle: { $in: ['active', null] },
  }).lean();
  if (!task) return res.status(404).json({ message: 'Active task not found.' });
  await TaskReview.init();
  try {
    await TaskReview.create({
      ...data,
      project: req.sharedProject._id,
      requester: req.user._id,
      title: task.title,
      description: task.description,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return res
      .status(409)
      .json({ message: 'This reviewer already has a pending request for this task.' });
  }
  res.status(201).json({ message: 'Review requested.' });
});
reviewRouter.patch('/:reviewId', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.reviewId))
    return res.status(400).json({ message: 'Invalid review ID.' });
  const { action, response } = parse(decisionSchema, req.body);
  const filter = {
    _id: req.params.reviewId,
    project: req.sharedProject._id,
    status: 'pending',
  };
  if (action === 'cancel') {
    if (req.projectRole !== 'owner') filter.requester = req.user._id;
  } else filter.reviewer = req.user._id;
  // Expected status prevents a second or competing decision from replacing the first.
  const result = await TaskReview.updateOne(filter, {
    $set: {
      status:
        action === 'approve'
          ? 'approved'
          : action === 'changes'
            ? 'changes'
            : 'cancelled',
      response,
      decidedAt: new Date(),
    },
  });
  if (!result.modifiedCount)
    return res.status(409).json({
      message:
        'This request changed or you cannot make this decision. Refresh and try again.',
    });
  res.status(204).end();
});
