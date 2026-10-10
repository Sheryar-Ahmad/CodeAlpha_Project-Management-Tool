import { Router } from 'express';
import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { MongoRateStore } from '../lib/rateStore.js';
import { parse } from '../lib/validation.js';
import { importFileSchema, importDrafts } from '../lib/taskImport.js';
import { TaskImport } from '../models/TaskImport.js';
import { Task } from '../models/Task.js';
import { taskActivity } from '../lib/taskActivity.js';
import { Project } from '../models/Project.js';
export const importsRouter = Router();
importsRouter.use(requireAuth);
const limiter = rateLimit({
  windowMs: 3600000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  store: new MongoRateStore('task-import'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Import limit reached. Try again in an hour.' },
});
const previewSchema = z.object({ file: importFileSchema }).strict();
const saveSchema = z
  .object({
    file: importFileSchema,
    key: z.string().uuid(),
    projectName: z.string().trim().min(1).max(60),
  })
  .strict();
importsRouter.post('/preview', limiter, (req, res) => {
  const { file } = parse(previewSchema, req.body);
  res.json({
    count: file.tasks.length,
    tasks: file.tasks.map((row) => ({
      title: row.title,
      status: row.status,
      lifecycle: row.lifecycle,
      due: row.due,
    })),
  });
});
importsRouter.post('/', limiter, async (req, res) => {
  const data = parse(saveSchema, req.body);
  const digest = createHash('sha256')
    .update(JSON.stringify({ file: data.file, projectName: data.projectName }))
    .digest('hex');
  await TaskImport.init();
  let job = await TaskImport.findOne({ owner: req.user._id, key: data.key }).lean();
  if (!job) {
    if (await Project.exists({ owner: req.user._id, name: data.projectName }))
      return res
        .status(409)
        .json({ message: 'Choose a new project name for this import.' });
    try {
      job = (
        await TaskImport.create({
          owner: req.user._id,
          key: data.key,
          digest,
          projectName: data.projectName,
          count: data.file.tasks.length,
          project: new mongoose.Types.ObjectId(),
          tasks: importDrafts(data.file, data.projectName, randomUUID).map((draft) => ({
            id: new mongoose.Types.ObjectId(),
            draft,
          })),
        })
      ).toObject();
    } catch (error) {
      if (error.code !== 11000) throw error;
      job = await TaskImport.findOne({ owner: req.user._id, key: data.key }).lean();
    }
  }
  if (!job || job.digest !== digest)
    return res.status(409).json({
      message:
        'This import retry has different content. Retry the original file and project name.',
    });
  if (job.ready)
    return res.json({ ready: true, projectId: String(job.project), count: job.count });
  await Project.init();
  try {
    await Project.updateOne(
      { _id: job.project, owner: req.user._id },
      {
        $setOnInsert: {
          owner: req.user._id,
          name: job.projectName,
          description: 'Imported task backup',
          status: 'planned',
          startDate: '',
          targetDate: '',
          milestones: [],
        },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (
      error.code === 11000 &&
      !(await Project.exists({ _id: job.project, owner: req.user._id }))
    )
      return res.status(409).json({
        message: 'This project name was taken. Start a new import with another name.',
      });
    if (error.code !== 11000) throw error;
  }
  for (const item of job.tasks) {
    try {
      await Task.updateOne(
        { _id: item.id, owner: req.user._id },
        {
          $setOnInsert: {
            ...item.draft,
            activity: [taskActivity(req.user, 'Imported task')],
            owner: req.user._id,
            projectId: job.project,
          },
        },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      if (
        error.code !== 11000 ||
        !(await Task.exists({ _id: item.id, owner: req.user._id }))
      )
        throw error;
    }
  }
  await TaskImport.updateOne(
    { _id: job._id, owner: req.user._id },
    { $set: { ready: true }, $unset: { tasks: 1 } },
  );
  // Keep only project ID/count/digest for completed retries, rather than a second copy of private task content.
  res.json({ ready: true, projectId: String(job.project), count: job.tasks.length });
});
