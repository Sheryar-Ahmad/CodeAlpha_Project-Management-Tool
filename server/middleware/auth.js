import { createHash, randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
const cookieName = 'orbit_session';
const duration = 7 * 24 * 60 * 60 * 1000;
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api',
});
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  ...(user.deleting ? { deleting: true } : {}),
});
export async function createSession(res, user) {
  const token = randomBytes(32).toString('hex');
  await Session.create({
    user: user._id,
    authVersion: user.authVersion ?? 0,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + duration),
  });
  res.cookie(cookieName, token, { ...options(), maxAge: duration });
}
export async function requireAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    return res.status(401).json({ message: 'Please sign in to continue.' });
  const session = await Session.findOne({
    tokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session)
    return res.status(401).json({ message: 'Your session has expired. Please sign in.' });
  const user = await User.findById(session.user).lean();
  if (!user || (session.authVersion ?? 0) !== (user.authVersion ?? 0))
    return res.status(401).json({ message: 'Please sign in to continue.' });
  if (
    user.deleting &&
    !['GET /api/auth/me', 'POST /api/auth/logout', 'DELETE /api/account'].includes(
      req.method + ' ' + req.originalUrl,
    )
  )
    return res
      .status(403)
      .json({
        message: 'Account deletion is in progress. Resume it from Account settings.',
      });
  req.user = user;
  req.sessionToken = token;
  next();
}
export function clearSessionCookie(res) {
  res.clearCookie(cookieName, options());
}
export function requireTrustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!process.env.APP_ORIGIN || req.get('origin') !== process.env.APP_ORIGIN)
    return res.status(403).json({ message: 'Request origin is not allowed.' });
  next();
}
