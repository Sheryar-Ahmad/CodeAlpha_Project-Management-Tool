import { runProjectRules } from '../lib/automation.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parse } from '../lib/validation.js';
import {
  requireProjectAccess,
  requireProjectOwner,
} from '../middleware/projectAccess.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { taskActivity } from '../lib/taskActivity.js';
import { projectTemplates } from '../../shared/projectTemplates.js';
export const workflowRouter = Router({ mergeParams: true });
workflowRouter.use(requireProjectAccess);
workflowRouter.get('/template', (req, res) => {
  res.json({
    templateId: req.sharedProject.templateId ?? '',
    ready: req.sharedProject.templateReady ?? false,
  });
});
workflowRouter.post('/template', requireProjectOwner, async (req, res) => {
  const { templateId } = parse(
    z.object({ templateId: z.enum(projectTemplates.map((item) => item.id)) }).strict(),
    req.body,
  );
  const template = projectTemplates.find((item) => item.id === templateId);
  // Reserve task IDs in the project before creating tasks. Retrying repairs partial setup.
  let project = await Project.findOneAndUpdate(
    {
      _id: req.sharedProject._id,
      owner: req.user._id,
      templateId: { $in: ['', null] },
    },
    {
      $set: {
        templateId,
        templateReady: false,
        templateTasks: template.tasks.map(() => new mongoose.Types.ObjectId()),
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!project)
    project = await Project.findOne({
      _id: req.sharedProject._id,
      owner: req.user._id,
    }).lean();
  if (!project || project.templateId !== templateId)
    return res
      .status(409)
      .json({ message: 'A different template is already connected to this project.' });
  if (project.templateReady) return res.json({ ready: true, created: 0 });
  for (const [index, starter] of template.tasks.entries()) {
    const id = project.templateTasks[index];
    if (!id) throw new Error('Template setup is missing its reserved task IDs.');
    try {
      await Task.updateOne(
        { _id: id, owner: project.owner },
        {
          $setOnInsert: {
            owner: project.owner,
            activity: [taskActivity(req.user, 'Created from project template')],
            projectId: project._id,
            project: project.name,
            title: starter.title,
            description: starter.description,
            estimateMinutes: starter.estimateMinutes,
            status: 'todo',
            lifecycle: 'active',
            priority: 'medium',
            recurrence: 'none',
            due: '',
            notes: '',
            links: [],
            blockerReason: '',
            checklist: starter.steps.map((text) => ({
              id: randomUUID(),
              text,
              done: false,
            })),
          },
        },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      if (error.code !== 11000 || !(await Task.exists({ _id: id, owner: project.owner })))
        throw error;
    }
  }
  await Project.updateOne(
    { _id: project._id, owner: project.owner, templateId },
    { $set: { templateReady: true } },
  );
  res.json({ ready: true, created: template.tasks.length });
});

const automationSchema = z
  .object({
    checklistToDone: z.boolean(),
    overdueHigh: z.boolean(),
    revision: z.number().int().min(0),
  })
  .strict();
workflowRouter.get('/automation', (req, res) =>
  res.json({
    checklistToDone: req.sharedProject.automation?.checklistToDone ?? false,
    overdueHigh: req.sharedProject.automation?.overdueHigh ?? false,
    revision: req.sharedProject.automationRevision ?? 0,
    lastRun:
      req.sharedProject.automationLastRunAt?.getTime() > 0
        ? req.sharedProject.automationLastRunAt
        : null,
  }),
);
workflowRouter.patch('/automation', requireProjectOwner, async (req, res) => {
  const { revision, ...automation } = parse(automationSchema, req.body);
  const result = await Project.updateOne(
    {
      _id: req.sharedProject._id,
      owner: req.user._id,
      automationRevision: revision === 0 ? { $in: [0, null] } : revision,
    },
    { $set: { automation }, $inc: { automationRevision: 1 } },
    { runValidators: true },
  );
  if (!result.matchedCount)
    return res
      .status(409)
      .json({ message: 'Rules changed. Refresh before editing again.' });
  res.status(204).end();
});
workflowRouter.post('/automation/run', requireProjectOwner, async (req, res) => {
  parse(z.object({}).strict(), req.body ?? {});
  res.json(await runProjectRules(req.sharedProject));
});
