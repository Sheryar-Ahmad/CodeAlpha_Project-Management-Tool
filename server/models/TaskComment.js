import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, trim: true, required: true, maxlength: 2000 },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1, task: 1, createdAt: -1, _id: -1 });
export const TaskComment =
  mongoose.models.TaskComment || mongoose.model('TaskComment', schema);
