import mongoose from 'mongoose';
const edge = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
    },
    revision: { type: Number, default: 0 },
    edges: { type: [edge], default: [], validate: (items) => items.length <= 200 },
  },
  { timestamps: true, versionKey: false },
);
export const ProjectDependencies =
  mongoose.models.ProjectDependencies || mongoose.model('ProjectDependencies', schema);
