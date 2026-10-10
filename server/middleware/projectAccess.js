import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { ProjectMember } from '../models/ProjectMember.js';
// Project access is checked on every shared request, including writes after removal.
export async function requireProjectAccess(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: 'Invalid project ID.' });
  const project = await Project.findById(req.params.id).lean();
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  if (!(await User.exists({ _id: project.owner, deleting: { $ne: true } })))
    return res.status(404).json({ message: 'Project not found.' });
  const isOwner = String(project.owner) === String(req.user._id);
  const membership = isOwner
    ? null
    : await ProjectMember.findOne({
        project: project._id,
        user: req.user._id,
        status: 'active',
      })
        .select('role')
        .lean();
  if (!isOwner && !membership)
    return res.status(404).json({ message: 'Project not found.' });
  const role = isOwner ? 'owner' : (membership.role ?? 'member');
  // Only the dedicated portal router opts into guest access.
  if (role === 'guest' && !req.guestPortal)
    return res.status(404).json({ message: 'Project not found.' });
  req.sharedProject = project;
  req.projectRole = role;
  next();
}
export function requireProjectOwner(req, res, next) {
  if (req.projectRole !== 'owner')
    return res
      .status(403)
      .json({ message: 'Only the project owner can manage its members.' });
  next();
}
// A member's shared route can never fall back to their private task scope.
export function taskScope(req) {
  return req.sharedProject
    ? { owner: req.sharedProject.owner, projectId: req.sharedProject._id }
    : { owner: req.user._id };
}
