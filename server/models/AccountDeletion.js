import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    completedAt: Date,
    lastSweptAt: { type: Date, default: () => new Date(0) },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000) },
  },
  { timestamps: true, versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AccountDeletion =
  mongoose.models.AccountDeletion || mongoose.model('AccountDeletion', schema);
