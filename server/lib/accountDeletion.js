import { ProjectSchedule } from '../models/ProjectSchedule.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { ProjectNote } from '../models/ProjectNote.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { TaskComment } from '../models/TaskComment.js';
import { TaskReview } from '../models/TaskReview.js';
import { ProjectDependencies } from '../models/ProjectDependencies.js';
import { ProjectCapacity } from '../models/ProjectCapacity.js';
import { ProjectGoal } from '../models/ProjectGoal.js';
import { WorkRequest } from '../models/WorkRequest.js';
import { WorkLog } from '../models/WorkLog.js';
import { TaskImport } from '../models/TaskImport.js';
import { AccountDeletion } from '../models/AccountDeletion.js';

// Idempotent batches work on standalone MongoDB as well as hosted replica sets.
export async function purgeAccount(user) {
  const account = await User.findById(user).select('deleting').lean();
  if (account && !account.deleting) return false;
  const projects = await Project.find({ owner: user }).select('_id').limit(5).lean();
  for (const project of projects) {
    for (const model of [
      ProjectMember,
      ProjectNote,
      TaskComment,
      TaskReview,
      ProjectDependencies,
      ProjectCapacity,
      ProjectGoal,
      ProjectSchedule,
      WorkRequest,
    ])
      await model.deleteMany({ project: project._id });
    await Task.deleteMany({ projectId: project._id, owner: user });
    // Delete the parent last so a failed batch can always find and retry it.
    await Project.deleteOne({ _id: project._id, owner: user });
  }
  await Promise.all([
    Task.deleteMany({ owner: user }),
    WorkLog.deleteMany({ owner: user }),
    TaskImport.deleteMany({ owner: user }),
    ProjectNote.deleteMany({ $or: [{ owner: user }, { createdBy: user }] }),
    ProjectMember.deleteMany({ user }),
    TaskComment.deleteMany({ author: user }),
    TaskReview.deleteMany({ $or: [{ requester: user }, { reviewer: user }] }),
    ProjectCapacity.deleteMany({ user }),
    ProjectGoal.deleteMany({ createdBy: user }),
    WorkRequest.deleteMany({ requester: user }),
    Task.updateMany({ assignee: user }, { $set: { assignee: null } }),
  ]);
  const remaining = await Project.exists({ owner: user });
  if (remaining) return false;
  await Session.deleteMany({ user });
  await User.deleteOne({ _id: user, deleting: true });
  await AccountDeletion.updateOne(
    { user },
    { $set: { completedAt: new Date(), lastSweptAt: new Date() } },
  );
  return true;
}
