import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    authVersion: { type: Number, default: 0 },
    recoveryHash: { type: String, default: '', select: false },
  },
  { timestamps: true },
);
export const User = mongoose.models.User || mongoose.model('User', schema);
