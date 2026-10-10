import { validMilestones } from '../../shared/project.js';
import mongoose from 'mongoose';
import { projectStatuses } from '../../shared/project.js';
import { validDate } from '../../shared/date.js';
const milestone = new mongoose.Schema(
  {
    id: { type: String, required: true, maxlength: 100 },
    title: { type: String, trim: true, required: true, maxlength: 120 },
    due: { type: String, default: '', validate: validDate },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    templateId: { type: String, default: '' },
    templateReady: { type: Boolean, default: false },
    templateTasks: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    milestones: { type: [milestone], default: [], validate: validMilestones },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    startDate: { type: String, default: '', validate: validDate },
    targetDate: { type: String, default: '', validate: validDate },
    status: { type: String, enum: Object.keys(projectStatuses), default: 'planned' },
  },
  { timestamps: true, versionKey: false },
);
// Names are exact labels, scoped to an account; another account may use the same name.
schema.index({ owner: 1, name: 1 }, { unique: true });
export const Project = mongoose.models.Project || mongoose.model('Project', schema);
