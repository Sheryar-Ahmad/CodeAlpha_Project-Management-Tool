import mongoose from 'mongoose';
const row = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: String,
    start: String,
    oldDue: String,
    newDue: String,
    expectedUpdatedAt: Date,
    state: { type: String, enum: ['pending', 'saved', 'conflict'], default: 'pending' },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    graphRevision: { type: Number, required: true },
    rows: { type: [row], required: true },
    lockedUntil: { type: Date, default: () => new Date(0) },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 3600000) },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ProjectSchedule =
  mongoose.models.ProjectSchedule || mongoose.model('ProjectSchedule', schema);
