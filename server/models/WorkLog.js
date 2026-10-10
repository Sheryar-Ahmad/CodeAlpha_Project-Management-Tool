import mongoose from 'mongoose';
import { validDate } from '../../shared/date.js';
const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    activity: { type: String, trim: true, required: true, maxlength: 120 },
    project: { type: String, trim: true, required: true, maxlength: 60 },
    date: { type: String, required: true, validate: validDate },
    minutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
      validate: Number.isInteger,
    },
    notes: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ owner: 1, date: -1, _id: -1 });
schema.index({ owner: 1, project: 1, date: -1, _id: -1 });
export const WorkLog = mongoose.models.WorkLog || mongoose.model('WorkLog', schema);
