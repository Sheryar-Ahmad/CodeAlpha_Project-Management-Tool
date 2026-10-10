import mongoose from 'mongoose';
import { validDate } from '../../shared/date.js';
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    due: { type: String, default: '', validate: validDate },
    status: {
      type: String,
      enum: ['pending', 'accepting', 'accepted', 'declined', 'cancelled'],
      default: 'pending',
    },
    response: { type: String, maxlength: 500, default: '' },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: () => new mongoose.Types.ObjectId(),
    },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1, status: 1, createdAt: -1, _id: -1 });
export const WorkRequest =
  mongoose.models.WorkRequest || mongoose.model('WorkRequest', schema);
