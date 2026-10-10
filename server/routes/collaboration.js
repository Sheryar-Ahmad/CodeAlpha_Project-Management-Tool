import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireProjectAccess, taskScope } from '../middleware/projectAccess.js';
import { Task } from '../models/Task.js';
import { TaskComment } from '../models/TaskComment.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { parse } from '../lib/validation.js';
export const collaborationRouter = Router({ mergeParams: true });
collaborationRouter.use(requireProjectAccess);
const assignmentSchema = z
  .object({
    assignee: z.union([
      z
        .string()
        .refine((value) => mongoose.isObjectIdOrHexString(value), 'Invalid assignee.'),
      z.null(),
    ]),
  })
  .strict();
const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const pageSchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
collaborationRouter.param('taskId', async (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid task ID.' });
  // Recovery records remain readable, but only active tasks accept changes.
  const task = await Task.findOne({ _id: id, ...taskScope(req) })
    .select('title lifecycle')
    .lean();
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  req.discussionTask = task;
  next();
});
collaborationRouter.patch('/:taskId/assignee', async (req, res) => {
  const { assignee } = parse(assignmentSchema, req.body);
  if (
    assignee &&
    assignee !== String(req.sharedProject.owner) &&
    !(await ProjectMember.exists({
      project: req.sharedProject._id,
      user: assignee,
      status: 'active',
      role: { $in: ['member', null] },
    }))
  )
    return res
      .status(400)
      .json({ message: 'Choose the owner or an accepted project member.' });
  const task = await Task.findOneAndUpdate(
    {
      _id: req.params.taskId,
      ...taskScope(req),
      lifecycle: { $in: ['active', null] },
    },
    { $set: { assignee } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!task)
    return res.status(409).json({ message: 'Only active tasks can be assigned.' });
  res.json({ assignee: task.assignee ? String(task.assignee) : null });
});
const serialize = (comment, req) => ({
  id: String(comment._id),
  body: comment.body,
  author: comment.author
    ? { id: String(comment.author._id), name: comment.author.name }
    : null,
  createdAt: comment.createdAt,
  canDelete:
    req.projectRole === 'owner' || String(comment.author?._id) === String(req.user._id),
});
collaborationRouter.get('/:taskId/comments', async (req, res) => {
  const { page } = parse(pageSchema, req.query);
  const comments = await TaskComment.find({
    project: req.sharedProject._id,
    task: req.params.taskId,
  })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * 20)
    .limit(21)
    .populate('author', 'name')
    .lean();
  res.json({
    comments: comments.slice(0, 20).map((comment) => serialize(comment, req)),
    hasMore: comments.length > 20,
  });
});
collaborationRouter.post('/:taskId/comments', async (req, res) => {
  const { body } = parse(commentSchema, req.body);
  if (req.discussionTask.lifecycle && req.discussionTask.lifecycle !== 'active')
    return res.status(409).json({ message: 'Restore the task before adding a comment.' });
  await TaskComment.create({
    project: req.sharedProject._id,
    task: req.params.taskId,
    author: req.user._id,
    body,
  });
  res.status(201).json({ message: 'Comment added.' });
});
collaborationRouter.delete('/:taskId/comments/:commentId', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.commentId))
    return res.status(400).json({ message: 'Invalid comment ID.' });
  const result = await TaskComment.deleteOne({
    _id: req.params.commentId,
    project: req.sharedProject._id,
    task: req.params.taskId,
    ...(req.projectRole !== 'owner' ? { author: req.user._id } : {}),
  });
  if (!result.deletedCount)
    return res.status(404).json({ message: 'Comment not found.' });
  res.status(204).end();
});
