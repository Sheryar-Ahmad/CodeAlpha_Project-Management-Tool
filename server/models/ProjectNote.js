import mongoose from 'mongoose';
import { notebookKinds } from '../../shared/notebook.js';
import { validDate } from '../../shared/date.js';
const schema = new mongoose.Schema(
  {
    visibility: { type: String, enum: ['private', 'team'], default: 'private' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    kind: { type: String, enum: Object.keys(notebookKinds), required: true },
    title: { type: String, trim: true, maxlength: 120, required: true },
    body: { type: String, trim: true, maxlength: 3000, required: true },
    date: { type: String, required: true, validate: validDate },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, project: 1, updatedAt: -1, _id: -1 });
export const ProjectNote =
  mongoose.models.ProjectNote || mongoose.model('ProjectNote', schema);
