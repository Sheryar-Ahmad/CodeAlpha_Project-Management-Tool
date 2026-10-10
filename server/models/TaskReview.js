import { validResourceUrl } from '../../shared/task.js';
import mongoose from 'mongoose';

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
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000, default: '' },
    resources: { type: [resource], default: [], validate: (items) => items.length <= 8 },
    message: { type: String, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'changes', 'cancelled'],
      default: 'pending',
    },
    response: { type: String, maxlength: 500, default: '' },
    decidedAt: Date,
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1, createdAt: -1, _id: -1 });
schema.index(
  { task: 1, reviewer: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
export const TaskReview =
  mongoose.models.TaskReview || mongoose.model('TaskReview', schema);
