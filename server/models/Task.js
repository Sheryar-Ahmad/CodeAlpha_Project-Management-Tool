import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    project: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 1000 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['todo', 'progress', 'done'], default: 'todo' },
    due: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, updatedAt: -1, _id: -1 });
schema.index({ owner: 1, project: 1 });
schema.index({ owner: 1, status: 1, due: 1 });
export const Task = mongoose.models.Task || mongoose.model('Task', schema);
