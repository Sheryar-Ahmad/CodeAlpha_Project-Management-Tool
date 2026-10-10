import mongoose from 'mongoose';
const item = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    draft: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    digest: { type: String, required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, required: true, maxlength: 60 },
    count: { type: Number, required: true },
    tasks: { type: [item], required: true },
    ready: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, key: 1 }, { unique: true });
export const TaskImport =
  mongoose.models.TaskImport || mongoose.model('TaskImport', schema);
