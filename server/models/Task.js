import mongoose from 'mongoose';
import { validDate } from '../../shared/date.js';
import { taskStatuses, validResourceUrl } from '../../shared/task.js';

const checklistItem = new mongoose.Schema(
  {
    id: { type: String, required: true, maxlength: 100 },
    text: { type: String, required: true, trim: true, maxlength: 160 },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);
const resource = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 100 },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
      validate: validResourceUrl,
    },
  },
  { _id: false },
);

const activityEntry = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, maxlength: 60, required: true },
    action: { type: String, maxlength: 60, required: true },
    fields: { type: [String], default: [], validate: (fields) => fields.length <= 20 },
    at: { type: Date, required: true },
  },
  { _id: false },
);
const receipt = new mongoose.Schema(
  {
    key: { type: String, required: true },
    digest: { type: String, required: true },
    task: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { _id: false },
);
const pending = new mongoose.Schema(
  {
    key: String,
    task: mongoose.Schema.Types.ObjectId,
    draft: mongoose.Schema.Types.Mixed,
    worker: { type: String, default: '' },
    workerUntil: { type: Date, default: () => new Date(0) },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    activity: {
      type: [activityEntry],
      default: [],
      select: false,
      validate: (items) => items.length <= 50,
    },
    familyRevision: { type: Number, default: 0 },
    subtaskReceipts: {
      type: [receipt],
      default: [],
      select: false,
      validate: (items) => items.length <= 200,
    },
    subtaskPending: { type: pending, default: null, select: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lifecycle: {
      type: String,
      enum: ['active', 'archived', 'trashed'],
      default: 'active',
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    project: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 1000 },
    notes: { type: String, default: '', maxlength: 3000 },
    links: { type: [resource], default: [], validate: (items) => items.length <= 8 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: {
      type: String,
      enum: Object.keys(taskStatuses),
      default: 'todo',
    },
    blockerReason: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
      required: function () {
        return this.status === 'blocked';
      },
    },
    durationDays: {
      type: Number,
      default: 1,
      min: 1,
      max: 365,
      validate: Number.isInteger,
    },
    estimateMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 60000,
      validate: Number.isInteger,
    },
    due: { type: String, default: '', validate: validDate },
    recurrence: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none',
    },
    repeatDay: { type: Number, min: 1, max: 31 },
    repeatSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    repeatNext: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    checklist: {
      type: [checklistItem],
      default: [],
      validate: (items) =>
        items.length <= 20 && new Set(items.map((item) => item.id)).size === items.length,
    },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, parentTask: 1, projectId: 1 });
schema.index({ owner: 1, updatedAt: -1, _id: -1 });
schema.index({ owner: 1, lifecycle: 1, updatedAt: -1, _id: -1 });
schema.index({ owner: 1, project: 1 });
schema.index({ owner: 1, projectId: 1 });
schema.index({ projectId: 1, assignee: 1, lifecycle: 1 });
schema.index({ owner: 1, status: 1, due: 1 });
schema.index({ owner: 1, due: 1, _id: -1 });
schema.index({ repeatSource: 1 }, { unique: true, sparse: true });
export const Task = mongoose.models.Task || mongoose.model('Task', schema);
