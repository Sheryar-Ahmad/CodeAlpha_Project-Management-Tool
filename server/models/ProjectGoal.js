import mongoose from 'mongoose';
const result = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 120 },
    unit: { type: String, default: '', maxlength: 30 },
    baseline: { type: Number, required: true },
    current: { type: Number, required: true },
    target: { type: Number, required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    due: { type: String, default: '' },
    results: { type: [result], default: [] },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1, createdAt: -1, _id: -1 });
export const ProjectGoal =
  mongoose.models.ProjectGoal || mongoose.model('ProjectGoal', schema);
