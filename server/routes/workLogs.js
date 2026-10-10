import { Router } from 'express';
import mongoose from 'mongoose';
import { WorkLog } from '../models/WorkLog.js';
import { requireAuth } from '../middleware/auth.js';
import { parse, workLogSchema, workLogQuerySchema } from '../lib/validation.js';
import { weekBounds } from '../../shared/workLog.js';
export const workLogRouter = Router();
workLogRouter.use(requireAuth);
const serialize = (log) => ({
  id: String(log._id),
  activity: log.activity,
  project: log.project,
  date: log.date,
  minutes: log.minutes,
  notes: log.notes,
  createdAt: log.createdAt,
  updatedAt: log.updatedAt,
});
workLogRouter.get('/', async (req, res) => {
  const { date, project } = parse(workLogQuerySchema, req.query);
  const range = weekBounds(date);
  const logs = await WorkLog.find({
    owner: req.user._id,
    date: { $gte: range.start, $lte: range.end },
    ...(project ? { project } : {}),
  })
    .sort({ date: -1, _id: -1 })
    .limit(1001)
    .lean();
  res.json({
    logs: logs.slice(0, 1000).map(serialize),
    truncated: logs.length > 1000,
    range,
  });
});
workLogRouter.post('/', async (req, res) => {
  const data = parse(workLogSchema, req.body);
  const log = await WorkLog.create({ ...data, owner: req.user._id });
  res.status(201).json({ log: serialize(log) });
});
workLogRouter.param('id', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(400).json({ message: 'Invalid work log ID.' });
  next();
});
workLogRouter.patch('/:id', async (req, res) => {
  const data = parse(workLogSchema, req.body);
  const log = await WorkLog.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!log) return res.status(404).json({ message: 'Work log not found.' });
  res.json({ log: serialize(log) });
});
workLogRouter.delete('/:id', async (req, res) => {
  const result = await WorkLog.deleteOne({ _id: req.params.id, owner: req.user._id });
  if (!result.deletedCount)
    return res.status(404).json({ message: 'Work log not found.' });
  res.status(204).end();
});
