import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireProjectAccess } from '../middleware/projectAccess.js';
import { WorkRequest } from '../models/WorkRequest.js';
import { Task } from '../models/Task.js';
import { parse, validDate } from '../lib/validation.js';
export const workRequestRouter = Router({ mergeParams: true });
workRequestRouter.use(requireProjectAccess);
const requestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(''),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    due: z.string().refine(validDate, 'Enter a valid date.').default(''),
  })
  .strict();
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z
      .enum(['', 'pending', 'accepted', 'declined', 'cancelled'])
      .default('pending'),
  })
  .strict();
const decisionSchema = z
  .object({
    action: z.enum(['accept', 'decline', 'cancel']),
    response: z.string().trim().max(500).default(''),
  })
  .strict()
  .refine(
    (value) => value.action !== 'decline' || value.response.length > 0,
    'Explain why the request was declined.',
  );
workRequestRouter.get('/', async (req, res) => {
  const { page, status } = parse(querySchema, req.query);
  const requests = await WorkRequest.find({
    project: req.sharedProject._id,
    ...(status
      ? { status: status === 'pending' ? { $in: ['pending', 'accepting'] } : status }
      : {}),
  })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * 20)
    .limit(21)
    .populate('requester', 'name')
    .lean();
  res.json({
    requests: requests.slice(0, 20).map((item) => ({
      id: String(item._id),
      title: item.title,
      description: item.description,
      source: item.source ?? 'account',
      submitter: item.source === 'public' ? item.submitter : '',
      priority: item.priority,
      due: item.due,
      requester: item.requester
        ? { id: String(item.requester._id), name: item.requester.name }
        : null,
      status: item.status,
      response: item.response,
      createdAt: item.createdAt,
      task: item.status === 'accepted' ? String(item.task) : null,
      canDecide:
        req.projectRole === 'owner' && ['pending', 'accepting'].includes(item.status),
      canCancel:
        item.status === 'pending' &&
        (req.projectRole === 'owner' ||
          String(item.requester?._id) === String(req.user._id)),
    })),
    hasMore: requests.length > 20,
  });
});
workRequestRouter.post('/', async (req, res) => {
  const data = parse(requestSchema, req.body);
  await WorkRequest.create({
    ...data,
    project: req.sharedProject._id,
    requester: req.user._id,
  });
  res.status(201).json({ message: 'Request submitted.' });
});
workRequestRouter.patch('/:requestId', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.requestId))
    return res.status(400).json({ message: 'Invalid request ID.' });
  const { action, response } = parse(decisionSchema, req.body);
  const filter = { _id: req.params.requestId, project: req.sharedProject._id };
  if (action !== 'cancel' && req.projectRole !== 'owner')
    return res
      .status(403)
      .json({ message: 'Only the owner can accept or decline work requests.' });
  if (action !== 'accept') {
    const result = await WorkRequest.updateOne(
      {
        ...filter,
        status: 'pending',
        ...(action === 'cancel' && req.projectRole !== 'owner'
          ? { requester: req.user._id }
          : {}),
      },
      { $set: { status: action === 'cancel' ? 'cancelled' : 'declined', response } },
    );
    if (!result.modifiedCount)
      return res
        .status(409)
        .json({ message: 'This request changed or you cannot make this decision.' });
    return res.status(204).end();
  }
  // Reserve acceptance first. A concurrent decline/cancel can never leave an accepted task.
  await WorkRequest.updateOne(
    { ...filter, status: 'pending' },
    { $set: { status: 'accepting', response } },
  );
  const current = await WorkRequest.findOne(filter).lean();
  if (!current || !['accepting', 'accepted'].includes(current.status))
    return res
      .status(409)
      .json({ message: 'This request is no longer available to accept.' });
  if (current.status === 'accepted') return res.json({ task: String(current.task) });
  // The request's preallocated task ID makes parallel retries safe on standalone MongoDB.
  try {
    await Task.updateOne(
      {
        _id: current.task,
        owner: req.sharedProject.owner,
        projectId: req.sharedProject._id,
      },
      {
        $setOnInsert: {
          owner: req.sharedProject.owner,
          projectId: req.sharedProject._id,
          project: req.sharedProject.name,
          title: current.title,
          description: current.description,
          priority: current.priority,
          due: current.due,
          status: 'todo',
          lifecycle: 'active',
          notes: '',
          links: [],
          checklist: [],
          recurrence: 'none',
          blockerReason: '',
        },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (
      error.code !== 11000 ||
      !(await Task.exists({
        _id: current.task,
        owner: req.sharedProject.owner,
        projectId: req.sharedProject._id,
      }))
    )
      throw error;
  }
  await WorkRequest.updateOne(
    { ...filter, status: 'accepting' },
    { $set: { status: 'accepted' } },
  );
  res.json({ task: String(current.task) });
});
