import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { ProjectMember } from '../models/ProjectMember.js';
// Project access is checked on every shared request, including writes after removal.
export async function requireProjectAccess(req, res, next) {
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: 'Invalid project ID.' });
  const project = await Project.findById(req.params.id).lean();
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const isOwner = String(project.owner) === String(req.user._id);
  if (
    !isOwner &&
    !(await ProjectMember.exists({
      project: project._id,
      user: req.user._id,
      status: 'active',
    }))
  )
    return res.status(404).json({ message: 'Project not found.' });
  req.sharedProject = project;
  req.projectRole = isOwner ? 'owner' : 'member';
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
