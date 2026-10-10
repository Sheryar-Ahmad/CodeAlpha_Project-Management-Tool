import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireProjectAccess, taskScope } from '../middleware/projectAccess.js';
import { parse } from '../lib/validation.js';
import { ProjectDependencies } from '../models/ProjectDependencies.js';
import { Task } from '../models/Task.js';
import { hasDependencyCycle } from '../../shared/dependencies.js';
export const dependencyRouter = Router({ mergeParams: true });
dependencyRouter.use(requireProjectAccess);
const objectId = z
  .string()
  .refine((value) => mongoose.isObjectIdOrHexString(value), 'Invalid task ID.');
const edgeSchema = z
  .object({ from: objectId, to: objectId })
  .strict()
  .refine(
    (value) => value.from.toLowerCase() !== value.to.toLowerCase(),
    'A task cannot depend on itself.',
  );
const normalize = (edges) =>
  edges.map((edge) => ({ from: String(edge.from), to: String(edge.to) }));
dependencyRouter.get('/', async (req, res) => {
  const graph = await ProjectDependencies.findOne({
    project: req.sharedProject._id,
  }).lean();
  const edges = normalize(graph?.edges ?? []);
  const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
  const tasks = await Task.find({
    ...taskScope(req),
    _id: { $in: ids },
    lifecycle: { $in: ['active', 'archived', null] },
  })
    .select('title status')
    .lean();
  const byId = new Map(tasks.map((task) => [String(task._id), task]));
  res.json({
    edges: edges.map((edge) => ({
      ...edge,
      predecessor: byId.get(edge.from)
        ? { title: byId.get(edge.from).title, status: byId.get(edge.from).status }
        : null,
      dependent: byId.get(edge.to)
        ? { title: byId.get(edge.to).title, status: byId.get(edge.to).status }
        : null,
    })),
  });
});
async function changeGraph(req, res, remove) {
  const parsed = parse(edgeSchema, req.body);
  const data = { from: parsed.from.toLowerCase(), to: parsed.to.toLowerCase() };
  if (!remove) {
    const count = await Task.countDocuments({
      ...taskScope(req),
      _id: { $in: [data.from, data.to] },
      lifecycle: { $in: ['active', null] },
    });
    if (count !== 2)
      return res
        .status(404)
        .json({ message: 'Choose two active tasks in this project.' });
  }
  await ProjectDependencies.init();
  const filter = { project: req.sharedProject._id };
  try {
    await ProjectDependencies.updateOne(
      filter,
      { $setOnInsert: { project: req.sharedProject._id, edges: [], revision: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  // One document holds the graph. Compare-and-swap prevents concurrent edges bypassing cycle checks.
  for (let attempt = 0; attempt < 5; attempt++) {
    const graph = await ProjectDependencies.findOne(filter).lean();
    const existing = normalize(graph.edges);
    const matches = (edge) => edge.from === data.from && edge.to === data.to;
    if (!remove && existing.some(matches))
      return res.status(409).json({ message: 'This dependency already exists.' });
    const next = remove ? existing.filter((edge) => !matches(edge)) : [...existing, data];
    if (next.length > 200)
      return res
        .status(400)
        .json({ message: 'A project supports up to 200 dependencies.' });
    if (hasDependencyCycle(next))
      return res
        .status(400)
        .json({ message: 'This dependency would create a circular chain.' });
    const result = await ProjectDependencies.updateOne(
      { _id: graph._id, revision: graph.revision },
      { $set: { edges: next }, $inc: { revision: 1 } },
      { runValidators: true },
    );
    if (result.modifiedCount) return res.status(remove ? 204 : 201).end();
  }
  res.status(409).json({ message: 'Dependencies changed. Refresh and try again.' });
}
dependencyRouter.post('/', (req, res) => changeGraph(req, res, false));
dependencyRouter.delete('/', (req, res) => changeGraph(req, res, true));
