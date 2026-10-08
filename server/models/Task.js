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

const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lifecycle: {
      type: String,
      enum: ['active', 'archived', 'trashed'],
      default: 'active',
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
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
    due: { type: String, default: '', validate: validDate },
    checklist: {
      type: [checklistItem],
      default: [],
      validate: (items) =>
        items.length <= 20 && new Set(items.map((item) => item.id)).size === items.length,
    },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, updatedAt: -1, _id: -1 });
schema.index({ owner: 1, lifecycle: 1, updatedAt: -1, _id: -1 });
schema.index({ owner: 1, project: 1 });
schema.index({ owner: 1, status: 1, due: 1 });
schema.index({ owner: 1, due: 1, _id: -1 });
export const Task = mongoose.models.Task || mongoose.model('Task', schema);
