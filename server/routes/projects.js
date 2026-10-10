import { goalsRouter } from './goals.js';
import { workloadRouter } from './workload.js';
import { guestPortalRouter } from './guestPortal.js';
import { workRequestRouter } from './workRequests.js';
import { dependencyRouter } from './dependencies.js';
import { reviewRouter } from './reviews.js';
import { collaborationRouter } from './collaboration.js';
import { requireProjectAccess } from '../middleware/projectAccess.js';
import { memberRouter } from './teams.js';
import { taskRouter } from './tasks.js';
import { Task } from '../models/Task.js';
import { projectNotesRouter } from './projectNotes.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, projectSchema, projectUpdateSchema } from '../lib/validation.js';
export const projectRouter = Router();
projectRouter.use(requireAuth);
projectRouter.use('/:id/guest', guestPortalRouter);
projectRouter.use('/:id/workload', workloadRouter);
projectRouter.use('/:id/goals', goalsRouter);
projectRouter.use('/:id/members', memberRouter);
projectRouter.use('/:id/collaboration', collaborationRouter);
projectRouter.use('/:id/reviews', reviewRouter);
projectRouter.use('/:id/dependencies', dependencyRouter);
projectRouter.use('/:id/requests', workRequestRouter);
projectRouter.use('/:id/tasks', requireProjectAccess, taskRouter);
projectRouter.use('/:id/notes', projectNotesRouter);
projectRouter.use('/:id/team-notes', requireProjectAccess, projectNotesRouter);
const serialize = (project) => ({
  id: String(project._id),
  name: project.name,
  milestones: (project.milestones ?? []).map(({ id, title, due, done }) => ({
    id,
    title,
    due,
    done,
  })),
  description: project.description,
  startDate: project.startDate,
  targetDate: project.targetDate,
  status: project.status,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});
projectRouter.get('/', async (req, res) => {
  const projects = await Project.find({ owner: req.user._id })
    .sort({ name: 1 })
    .limit(1001)
    .lean();
  res.json({
    projects: projects.slice(0, 1000).map(serialize),
    hasMore: projects.length > 1000,
  });
});
projectRouter.post('/', async (req, res) => {
  const data = parse(projectSchema, req.body);
  try {
    await Project.init();
    const project = await Project.create({ ...data, owner: req.user._id });
    res.status(201).json({ project: serialize(project) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    res
      .status(409)
      .json({ message: 'This project already has details. Open Projects to edit them.' });
  }
});
projectRouter.patch('/:id', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: 'Invalid project ID.' });
  const data = parse(projectUpdateSchema, req.body);
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  res.json({ project: serialize(project) });
});

projectRouter.patch('/:id/link-tasks', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: 'Invalid project ID.' });
  if (req.body && Object.keys(req.body).length)
    return res
      .status(400)
      .json({ message: 'This action does not accept project or owner fields.' });
  const project = await Project.findOne({
    _id: req.params.id,
    owner: req.user._id,
  }).lean();
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const result = await Task.updateMany(
    { owner: req.user._id, project: project.name, projectId: null },
    { $set: { projectId: project._id } },
  );
  res.json({ linked: result.modifiedCount });
});
