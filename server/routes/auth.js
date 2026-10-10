import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { parse, registerSchema, loginSchema } from '../lib/validation.js';
import {
  requireAuth,
  createSession,
  publicUser,
  tokenHash,
  clearSessionCookie,
} from '../middleware/auth.js';
import { MongoRateStore } from '../lib/rateStore.js';
export const authRouter = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  store: new MongoRateStore('auth'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again later.' },
});
authRouter.post('/register', limiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const user = await User.create({
    name: data.name,
    email: data.email,
    passwordHash: await hashPassword(data.password),
  });
  await createSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});
authRouter.post('/login', limiter, async (req, res) => {
  const data = parse(loginSchema, req.body);
  const user = await User.findOne({ email: data.email }).select('+passwordHash');
  // Equalize password work for unknown users; never return stored hashes.
  const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
  const valid = await verifyPassword(data.password, user?.passwordHash ?? dummy);
  if (!user || !valid)
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  await createSession(res, user);
  res.json({ user: publicUser(user) });
});
authRouter.get('/me', requireAuth, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);
authRouter.post('/logout', requireAuth, async (req, res) => {
  await Session.deleteOne({ tokenHash: tokenHash(req.sessionToken) });
  clearSessionCookie(res);
  res.status(204).end();
});

const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128);
authRouter.post('/recovery-code', limiter, requireAuth, async (req, res) => {
  const { password } = parse(
    z.object({ password: z.string().min(1).max(128) }).strict(),
    req.body,
  );
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return res.status(401).json({ message: 'Current password is incorrect.' });
  const code = randomBytes(32).toString('hex');
  const updated = await User.updateOne(
    {
      _id: user._id,
      passwordHash: user.passwordHash,
      authVersion: user.authVersion ? user.authVersion : { $in: [0, null] },
    },
    { $set: { recoveryHash: tokenHash(code) } },
  );
  if (!updated.matchedCount)
    return res
      .status(409)
      .json({ message: 'Account security changed. Sign in again before continuing.' });
  res.json({ code });
});
authRouter.post('/recover', limiter, async (req, res) => {
  const data = parse(
    z
      .object({
        email: loginSchema.shape.email,
        code: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{64}$/),
        password: passwordSchema,
      })
      .strict(),
    req.body,
  );
  // Hash password work happens even if the supplied recovery code does not match.
  const passwordHash = await hashPassword(data.password);
  const user = await User.findOneAndUpdate(
    { email: data.email, recoveryHash: tokenHash(data.code) },
    { $set: { passwordHash, recoveryHash: '' }, $inc: { authVersion: 1 } },
    { returnDocument: 'after' },
  );
  if (!user)
    return res
      .status(400)
      .json({ message: 'Email or recovery code is incorrect or already used.' });
  await Session.deleteMany({ user: user._id });
  res.json({
    message:
      'Password updated. Sign in with your new password, then create a new recovery code.',
  });
});
authRouter.post('/password', limiter, requireAuth, async (req, res) => {
  const data = parse(
    z
      .object({ password: z.string().min(1).max(128), newPassword: passwordSchema })
      .strict(),
    req.body,
  );
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await verifyPassword(data.password, user.passwordHash)))
    return res.status(401).json({ message: 'Current password is incorrect.' });
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      passwordHash: user.passwordHash,
      authVersion: user.authVersion ? user.authVersion : { $in: [0, null] },
    },
    {
      $set: { passwordHash: await hashPassword(data.newPassword), recoveryHash: '' },
      $inc: { authVersion: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated)
    return res
      .status(409)
      .json({ message: 'Account security changed. Sign in again before continuing.' });
  await Session.deleteMany({ user: user._id });
  await createSession(res, updated);
  res.json({
    message:
      'Password updated. Other sessions and the previous recovery code have been revoked.',
  });
});
