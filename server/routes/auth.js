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
