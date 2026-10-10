import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    week: { type: String, required: true },
    minutes: {
      type: Number,
      required: true,
      min: 0,
      max: 10080,
      validate: Number.isInteger,
    },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ project: 1, user: 1, week: 1 }, { unique: true });
export const ProjectCapacity =
  mongoose.models.ProjectCapacity || mongoose.model('ProjectCapacity', schema);
