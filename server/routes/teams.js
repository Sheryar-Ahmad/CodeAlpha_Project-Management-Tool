import { TaskReview } from '../models/TaskReview.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  requireProjectAccess,
  requireProjectOwner,
} from '../middleware/projectAccess.js';
import { Project } from '../models/Project.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { User } from '../models/User.js';
import { parse } from '../lib/validation.js';
export const teamRouter = Router();
teamRouter.use(requireAuth);
const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(['member', 'guest']).default('member'),
  })
  .strict();
const responseSchema = z.object({ action: z.enum(['accept', 'decline']) }).strict();
const person = (user) => ({ id: String(user._id), name: user.name });
const projectFields = 'name description owner status';
// Only invitations addressed to this session and accepted memberships are returned.
teamRouter.get('/', async (req, res) => {
  const memberships = await ProjectMember.find({
    user: req.user._id,
    status: { $in: ['invited', 'active'] },
  })
    .sort({ updatedAt: -1 })
    .limit(1001)
    .populate('project', projectFields)
    .lean();
  const owned = await Project.find({ owner: req.user._id })
    .sort({ name: 1 })
    .limit(1001)
    .lean();
  const visible = memberships.slice(0, 1000).filter((item) => item.project);
  const accessibleIds = [
    ...owned.slice(0, 1000).map((item) => item._id),
    ...visible
      .filter((item) => item.status === 'active' && item.role !== 'guest')
      .map((item) => item.project._id),
  ];
  const reviewInbox = await TaskReview.find({
    project: { $in: accessibleIds },
    reviewer: req.user._id,
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .limit(101)
    .populate('project', 'name')
    .lean();
  res.json({
    projects: [
      ...owned.slice(0, 1000).map((item) => ({
        id: String(item._id),
        name: item.name,
        description: item.description,
        role: 'owner',
      })),
      ...visible
        .filter((item) => item.status === 'active')
        .map((item) => ({
          id: String(item.project._id),
          name: item.project.name,
          description: item.project.description,
          role: item.role ?? 'member',
        })),
    ],
    reviewInbox: reviewInbox
      .slice(0, 100)
      .filter((item) => item.project)
      .map((item) => ({
        id: String(item._id),
        title: item.title,
        projectId: String(item.project._id),
        project: item.project.name,
      })),
    inboxTruncated: reviewInbox.length > 100,
    invitations: visible
      .filter((item) => item.status === 'invited')
      .map((item) => ({
        id: String(item._id),
        project: item.project.name,
        role: item.role ?? 'member',
      })),
    truncated: memberships.length > 1000 || owned.length > 1000,
  });
});
teamRouter.patch('/invitations/:invitationId', async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.invitationId))
    return res.status(400).json({ message: 'Invalid invitation ID.' });
  const { action } = parse(responseSchema, req.body);
  const invitation = await ProjectMember.findOneAndUpdate(
    {
      _id: req.params.invitationId,
      user: req.user._id,
      status: 'invited',
    },
    { $set: { status: action === 'accept' ? 'active' : 'declined' } },
    { returnDocument: 'after' },
  );
  if (!invitation)
    return res.status(409).json({
      message: 'This invitation is no longer pending. Refresh to see its status.',
    });
  res.status(204).end();
});

export const memberRouter = Router({ mergeParams: true });
memberRouter.use(requireProjectAccess);
memberRouter.get('/', async (req, res) => {
  const members = await ProjectMember.find({
    project: req.sharedProject._id,
    status: { $in: req.projectRole === 'owner' ? ['invited', 'active'] : ['active'] },
  })
    .sort({ createdAt: 1 })
    .limit(101)
    .populate('user', 'name')
    .lean();
  const owner = await User.findById(req.sharedProject.owner).select('name').lean();
  res.json({
    role: req.projectRole,
    owner: owner ? person(owner) : null,
    members: members
      .slice(0, 100)
      .filter((item) => item.user)
      .map((item) => ({
        id: String(item._id),
        user: person(item.user),
        status: item.status,
        role: item.role ?? 'member',
      })),
    truncated: members.length > 100,
  });
});
memberRouter.post('/', requireProjectOwner, async (req, res) => {
  const { email, role } = parse(inviteSchema, req.body);
  const user = await User.findOne({ email }).select('_id').lean();
  if (!user || String(user._id) === String(req.sharedProject.owner))
    return res
      .status(400)
      .json({ message: 'Use another existing Orbit account to invite a teammate.' });
  const existing = await ProjectMember.findOne({
    project: req.sharedProject._id,
    user: user._id,
  }).lean();
  if (existing && ['active', 'invited'].includes(existing.status))
    return res
      .status(409)
      .json({ message: 'This person already has access or a pending invitation.' });
  // A fixed project/user pair makes retries and concurrent invites duplicate-safe.
  if (existing) {
    const result = await ProjectMember.updateOne(
      { _id: existing._id, status: existing.status },
      { $set: { status: 'invited', role } },
    );
    if (!result.modifiedCount)
      return res
        .status(409)
        .json({ message: 'Membership changed. Refresh and try again.' });
  } else {
    await ProjectMember.init();
    try {
      await ProjectMember.create({
        project: req.sharedProject._id,
        user: user._id,
        role,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return res
        .status(409)
        .json({ message: 'An invitation already exists. Refresh to see its status.' });
    }
  }
  res
    .status(201)
    .json({ message: 'Invitation available in your teammate’s Team projects view.' });
});
memberRouter.delete('/:membershipId', requireProjectOwner, async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.membershipId))
    return res.status(400).json({ message: 'Invalid membership ID.' });
  const result = await ProjectMember.updateOne(
    {
      _id: req.params.membershipId,
      project: req.sharedProject._id,
      status: { $in: ['invited', 'active'] },
    },
    { $set: { status: 'revoked' } },
  );
  if (!result.modifiedCount)
    return res.status(404).json({ message: 'Membership not found.' });
  res.status(204).end();
});
