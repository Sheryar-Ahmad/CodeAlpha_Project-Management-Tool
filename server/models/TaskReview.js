import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000, default: '' },
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
