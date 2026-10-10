import { Router } from 'express';
import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { ProjectNote } from '../models/ProjectNote.js';
import { parse, notebookSchema, notebookQuerySchema } from '../lib/validation.js';
export const projectNotesRouter = Router({ mergeParams: true });
// Check the parent on every operation. A note ID alone never grants access.
projectNotesRouter.use(async (req, res, next) => {
  if (req.sharedProject) return next();
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: 'Invalid project ID.' });
  if (!(await Project.exists({ _id: req.params.id, owner: req.user._id })))
    return res.status(404).json({ message: 'Project not found.' });
  next();
});
const noteScope = (req) => ({
  owner: req.sharedProject?.owner ?? req.user._id,
  project: req.sharedProject?._id ?? req.params.id,
  visibility: req.sharedProject ? 'team' : { $in: ['private', null] },
});
const editScope = (req) => ({
  ...noteScope(req),
  ...(req.sharedProject && req.projectRole !== 'owner'
    ? { createdBy: req.user._id }
    : {}),
});
const serialize = (note, req) => ({
  canEdit:
    !req.sharedProject ||
    req.projectRole === 'owner' ||
    String(note.createdBy) === String(req.user._id),
  id: String(note._id),
  kind: note.kind,
  title: note.title,
  body: note.body,
  date: note.date,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});
projectNotesRouter.get('/', async (req, res) => {
  const { page, kind } = parse(notebookQuerySchema, req.query);
  const notes = await ProjectNote.find({
    ...noteScope(req),
    ...(kind ? { kind } : {}),
  })
    .sort({ updatedAt: -1, _id: -1 })
    .skip((page - 1) * 20)
    .limit(21)
    .lean();
  res.json({
    notes: notes.slice(0, 20).map((note) => serialize(note, req)),
    page,
    hasMore: notes.length > 20,
  });
});
projectNotesRouter.post('/', async (req, res) => {
  const data = parse(notebookSchema, req.body);
  const note = await ProjectNote.create({
    ...data,
    owner: req.sharedProject?.owner ?? req.user._id,
    project: req.sharedProject?._id ?? req.params.id,
    visibility: req.sharedProject ? 'team' : 'private',
    createdBy: req.user._id,
  });
  res.status(201).json({ note: serialize(note, req) });
});
projectNotesRouter.param('noteId', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid notebook entry ID.' });
  next();
});
projectNotesRouter.patch('/:noteId', async (req, res) => {
  const data = parse(notebookSchema, req.body);
  const note = await ProjectNote.findOneAndUpdate(
    { _id: req.params.noteId, ...editScope(req) },
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!note) return res.status(404).json({ message: 'Notebook entry not found.' });
  res.json({ note: serialize(note, req) });
});
projectNotesRouter.delete('/:noteId', async (req, res) => {
  const result = await ProjectNote.deleteOne({
    _id: req.params.noteId,
    ...editScope(req),
  });
  if (!result.deletedCount)
    return res.status(404).json({ message: 'Notebook entry not found.' });
  res.status(204).end();
});
