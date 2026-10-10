import { Project } from '../models/Project.js';

// Exact owner/name lookup preserves legacy labels while introducing stable IDs.
export async function ensurePrivateProject(owner, name) {
  await Project.init();
  const filter = { owner, name };
  try {
    return await Project.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          owner,
          name,
          description: '',
          startDate: '',
          targetDate: '',
          status: 'planned',
          milestones: [],
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Project.findOne(filter).lean();
  }
}
