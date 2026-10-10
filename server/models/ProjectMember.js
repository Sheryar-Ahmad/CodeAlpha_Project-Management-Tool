import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['member', 'guest'], default: 'member' },
    status: {
      type: String,
      enum: ['invited', 'active', 'declined', 'revoked'],
      default: 'invited',
    },
  },
  { timestamps: true },
);
schema.index({ project: 1, user: 1 }, { unique: true });
schema.index({ user: 1, status: 1, updatedAt: -1 });
export const ProjectMember =
  mongoose.models.ProjectMember || mongoose.model('ProjectMember', schema);
