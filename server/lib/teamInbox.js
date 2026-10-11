import { Project } from '../models/Project.js';
import { ProjectMember } from '../models/ProjectMember.js';
import { User } from '../models/User.js';

// Derive current access on every read; removed members and deleted owners cannot
// retain task previews through their notification inbox.
export async function teamInboxScope(user) {
  const [owned, memberships] = await Promise.all([
    Project.find({ owner: user })
      .select('_id owner name')
      .sort({ _id: 1 })
      .limit(1001)
      .lean(),
    ProjectMember.find({ user, status: { $in: ['active', 'invited'] } })
      .sort({ updatedAt: -1 })
      .limit(1001)
      .populate('project', 'name owner')
      .lean(),
  ]);
  const owners = await User.find({
    _id: {
      $in: memberships.filter((item) => item.project).map((item) => item.project.owner),
    },
    deleting: { $ne: true },
  })
    .select('_id name')
    .lean();
  const live = new Map(owners.map((owner) => [String(owner._id), owner.name]));
  const visible = memberships
    .slice(0, 1000)
    .filter((item) => item.project && live.has(String(item.project.owner)));
  const projects = [
    ...owned.slice(0, 1000),
    ...visible
      .filter((item) => item.status === 'active' && item.role !== 'guest')
      .map((item) => item.project),
  ];
  return {
    invitations: visible
      .filter((item) => item.status === 'invited')
      .map((item) => ({
        id: String(item._id),
        projectId: String(item.project._id),
        project: item.project.name,
        from: live.get(String(item.project.owner)),
        role: item.role ?? 'member',
      })),
    taskFilter: {
      assignee: user,
      lifecycle: { $in: ['active', null] },
      status: { $ne: 'done' },
      $or: projects.length
        ? projects.map((project) => ({ projectId: project._id, owner: project.owner }))
        : [{ _id: null }],
    },
    names: new Map(projects.map((project) => [String(project._id), project.name])),
    truncated: owned.length > 1000 || memberships.length > 1000,
  };
}

export async function workspaceReadScope(req, scope) {
  // Shared routes keep their explicit project scope. Personal routes opt into
  // this read-only union; mutations and exports retain their existing scopes.
  if (req.sharedProject)
    return { owner: req.sharedProject.owner, projectId: req.sharedProject._id };
  if (scope !== 'workspace') return { owner: req.user._id };
  const access = await teamInboxScope(req.user._id);
  return {
    $and: [
      {
        $or: [
          { owner: req.user._id },
          { assignee: req.user._id, $or: access.taskFilter.$or },
        ],
      },
    ],
  };
}
