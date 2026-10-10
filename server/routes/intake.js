import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { WorkRequest } from '../models/WorkRequest.js';
import { tokenHash } from '../middleware/auth.js';
import { MongoRateStore } from '../lib/rateStore.js';
import { parse, validDate } from '../lib/validation.js';
import {
  requireProjectAccess,
  requireProjectOwner,
} from '../middleware/projectAccess.js';

export const intakeSettingsRouter = Router({ mergeParams: true });
intakeSettingsRouter.use(requireProjectAccess, requireProjectOwner);
intakeSettingsRouter.get('/', async (req, res) => {
  const project = await Project.findById(req.sharedProject._id)
    .select('+intakeHash')
    .lean();
  res.json({ enabled: Boolean(project?.intakeHash) });
});
intakeSettingsRouter.post('/', async (req, res) => {
  const { action } = parse(
    z.object({ action: z.enum(['rotate', 'disable']) }).strict(),
    req.body,
  );
  const token = action === 'rotate' ? randomBytes(32).toString('hex') : '';
  await Project.updateOne(
    { _id: req.sharedProject._id, owner: req.user._id },
    { $set: { intakeHash: token ? tokenHash(token) : '' } },
  );
  // The raw link is returned once. Database records contain only its digest.
  res.json({ enabled: Boolean(token), ...(token ? { token } : {}) });
});

export const publicIntakeRouter = Router();
publicIntakeRouter.use(
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    store: new MongoRateStore('intake-access'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many form visits. Please try again later.' },
  }),
);
async function findForm(req, res, next) {
  const token = req.get('X-Orbit-Intake');
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    return res.status(404).json({ message: 'This request form is unavailable.' });
  const hash = tokenHash(token);
  const project = await Project.findOne({ intakeHash: hash })
    .select('_id owner name')
    .lean();
  if (!project || !(await User.exists({ _id: project.owner, deleting: { $ne: true } })))
    return res.status(404).json({ message: 'This request form is unavailable.' });
  req.intakeProject = project;
  req.intakeHash = hash;
  next();
}
publicIntakeRouter.use(findForm);
publicIntakeRouter.get('/', (req, res) => res.json({ name: req.intakeProject.name }));
const perSender = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  store: new MongoRateStore('intake-send'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many submissions. Please try again later.' },
});
const perForm = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => req.intakeHash,
  store: new MongoRateStore('intake-form'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'This form has reached its daily submission limit.' },
});
const submissionSchema = z
  .object({
    key: z.string().uuid(),
    submitter: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(''),
    due: z.string().refine(validDate, 'Enter a valid date.').default(''),
    website: z.string().max(0).default(''),
  })
  .strict();
publicIntakeRouter.post('/', perSender, perForm, async (req, res) => {
  const { key, website, ...data } = parse(submissionSchema, req.body);
  const digest = tokenHash(JSON.stringify(data));
  const filter = { project: req.intakeProject._id, publicKey: key };
  await WorkRequest.init();
  try {
    await WorkRequest.updateOne(
      filter,
      {
        $setOnInsert: {
          ...data,
          ...filter,
          requester: null,
          source: 'public',
          priority: 'medium',
          submissionDigest: digest,
        },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const saved = await WorkRequest.findOne(filter).select('+submissionDigest').lean();
  if (!saved || saved.submissionDigest !== digest)
    return res
      .status(409)
      .json({ message: 'This submission changed. Start a new request.' });
  // No request ID, member data, task or decision status is exposed publicly.
  res.status(201).json({
    message: 'Request received. The project owner will review it before adding work.',
  });
});
