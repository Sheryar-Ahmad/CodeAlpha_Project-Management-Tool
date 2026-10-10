import { TaskComment } from '../models/TaskComment.js';
import { Task } from '../models/Task.js';
import { WorkRequest } from '../models/WorkRequest.js';
import { validDate } from '../../shared/date.js';
import { addDays, attentionReasons } from '../../shared/planning.js';
import { projectHealth } from '../../shared/project.js';
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

  const liveOwners = await User.find({
    _id: {
      $in: memberships.filter((item) => item.project).map((item) => item.project.owner),
    },
    deleting: { $ne: true },
  })
    .select('_id')
    .lean();
  const ownerIds = new Set(liveOwners.map((item) => String(item._id)));
  const visible = memberships
    .slice(0, 1000)
    .filter((item) => item.project && ownerIds.has(String(item.project.owner)));

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

// A derived report: no notification history or email delivery is implied.
teamRouter.get('/portfolio', async (req, res) => {
  const date = req.query.date;
  if (typeof date !== 'string' || !date || !validDate(date))
    return res.status(400).json({ message: 'Use a valid calendar date.' });
  const [owned, memberships] = await Promise.all([
    Project.find({ owner: req.user._id }).sort({ name: 1, _id: 1 }).limit(101).lean(),
    ProjectMember.find({ user: req.user._id, status: 'active', role: { $ne: 'guest' } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(101)
      .lean(),
  ]);
  const joined = await Project.find({
    _id: { $in: memberships.slice(0, 100).map((item) => item.project) },
    owner: { $ne: req.user._id },
  }).lean();
  const owners = await User.find({
    _id: { $in: joined.map((item) => item.owner) },
    deleting: { $ne: true },
  })
    .select('_id')
    .lean();
  const liveOwners = new Set(owners.map((item) => String(item._id)));
  const records = [
    ...owned.slice(0, 100).map((item) => ({ ...item, role: 'owner' })),
    ...joined
      .filter((item) => liveOwners.has(String(item.owner)))
      .map((item) => ({ ...item, role: 'member' })),
  ];
  const scopes = records.map((item) => ({ projectId: item._id, owner: item.owner }));
  const ownedIds = owned.slice(0, 100).map((item) => item._id);
  const ids = records.map((item) => item._id);
  const incomplete = { $ne: ['$status', 'done'] };
  const sumIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const summaries = scopes.length
    ? await Task.aggregate([
        { $match: { $or: scopes, lifecycle: 'active' } },
        {
          $group: {
            _id: '$projectId',
            total: { $sum: 1 },
            completed: sumIf({ $eq: ['$status', 'done'] }),
            blocked: sumIf({ $eq: ['$status', 'blocked'] }),
            overdue: sumIf({
              $and: [incomplete, { $gt: ['$due', ''] }, { $lt: ['$due', date] }],
            }),
            nextDue: {
              $min: {
                $cond: [{ $and: [incomplete, { $gt: ['$due', ''] }] }, '$due', null],
              },
            },
          },
        },
      ])
    : [];
  // $min ignores null values in a group: an undated task cannot hide a dated one.
  const stats = new Map(summaries.map((item) => [String(item._id), item]));
  const projects = records
    .map((item) => {
      const summary = stats.get(String(item._id)) ?? {
        total: 0,
        completed: 0,
        blocked: 0,
        overdue: 0,
        nextDue: null,
      };
      const project = {
        id: String(item._id),
        name: item.name,
        role: item.role,
        status: item.status,
        startDate: item.startDate,
        targetDate: item.targetDate,
        milestones: item.milestones,
        total: summary.total,
        completed: summary.completed,
        blocked: summary.blocked,
        overdue: summary.overdue,
        nextDue: summary.nextDue,
      };
      return { ...project, health: projectHealth(project, date) };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const attention = {
    lifecycle: 'active',
    status: { $ne: 'done' },
    $or: [
      { status: 'blocked' },
      { priority: 'high' },
      { due: { $gt: '', $lte: addDays(date, 3) } },
    ],
  };
  // Own work plus explicitly assigned shared work; never another person's private tasks.
  const assignmentScopes = [
    { owner: req.user._id },
    ...records
      .filter((item) => item.role === 'member')
      .map((item) => ({
        owner: item.owner,
        projectId: item._id,
        assignee: req.user._id,
      })),
  ];
  const [tasks, reviews, requests, invitations, notifications] = await Promise.all([
    Task.find({ $and: [attention, { $or: assignmentScopes }] })
      .select('title project projectId owner status priority due lifecycle')
      .sort({ due: 1, _id: 1 })
      .limit(31)
      .lean(),
    TaskReview.find({ project: { $in: ids }, reviewer: req.user._id, status: 'pending' })
      .select('title project')
      .sort({ createdAt: 1, _id: 1 })
      .limit(31)
      .lean(),
    WorkRequest.find({
      project: { $in: ownedIds },
      status: { $in: ['pending', 'accepting'] },
    })
      .select('title project status')
      .sort({ createdAt: 1, _id: 1 })
      .limit(31)
      .lean(),
    ProjectMember.find({ user: req.user._id, status: 'invited' })
      .select('project role')
      .sort({ createdAt: 1, _id: 1 })
      .limit(31)
      .populate('project', 'name owner')
      .lean(),
    TaskComment.aggregate([
      { $match: { project: { $in: ids }, notified: req.user._id, seenAt: null } },
      {
        $lookup: {
          from: Task.collection.name,
          let: { task: '$task', project: '$project' },
          pipeline: [
            {
              $match: {
                lifecycle: 'active',
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$task'] },
                    { $eq: ['$projectId', '$$project'] },
                  ],
                },
              },
            },
            { $project: { title: 1, owner: 1 } },
          ],
          as: 'linkedTask',
        },
      },
      { $unwind: '$linkedTask' },
      {
        $lookup: {
          from: Project.collection.name,
          localField: 'project',
          foreignField: '_id',
          as: 'parent',
        },
      },
      { $unwind: '$parent' },
      { $match: { $expr: { $eq: ['$linkedTask.owner', '$parent.owner'] } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: 31 },
      { $project: { task: 1, project: 1, createdAt: 1, title: '$linkedTask.title' } },
    ]),
  ]);
  const projectNames = new Map(projects.map((item) => [item.id, item.name]));
  const invitationOwners = await User.find({
    _id: {
      $in: invitations.filter((item) => item.project).map((item) => item.project.owner),
    },
    deleting: { $ne: true },
  })
    .select('_id')
    .lean();
  const validInvitationOwners = new Set(invitationOwners.map((item) => String(item._id)));
  res.json({
    date,
    projects,
    truncated: owned.length > 100 || memberships.length > 100,
    digest: {
      notifications: notifications.slice(0, 30).map((item) => ({
        id: String(item._id),
        taskId: String(item.task),
        projectId: String(item.project),
        project: projectNames.get(String(item.project)),
        title: item.title,
        createdAt: item.createdAt,
      })),
      tasks: tasks.slice(0, 30).map((item) => ({
        id: String(item._id),
        title: item.title,
        project: item.project,
        projectId: item.projectId ? String(item.projectId) : null,
        shared: String(item.owner) !== String(req.user._id),
        due: item.due,
        reasons: attentionReasons(item, date),
      })),
      reviews: reviews.slice(0, 30).map((item) => ({
        id: String(item._id),
        title: item.title,
        projectId: String(item.project),
        project: projectNames.get(String(item.project)),
      })),
      requests: requests.slice(0, 30).map((item) => ({
        id: String(item._id),
        title: item.title,
        projectId: String(item.project),
        project: projectNames.get(String(item.project)),
        status: item.status,
      })),
      invitations: invitations
        .slice(0, 30)
        .filter(
          (item) => item.project && validInvitationOwners.has(String(item.project.owner)),
        )
        .map((item) => ({
          id: String(item._id),
          project: item.project.name,
          role: item.role ?? 'member',
        })),
      truncated:
        notifications.length > 30 ||
        tasks.length > 30 ||
        reviews.length > 30 ||
        requests.length > 30 ||
        invitations.length > 30,
    },
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
  const user = await User.findOne({ email, deleting: { $ne: true } })
    .select('_id')
    .lean();
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
