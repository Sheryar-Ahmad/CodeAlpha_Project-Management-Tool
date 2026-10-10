import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, clearSessionCookie } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AccountDeletion } from '../models/AccountDeletion.js';
import { purgeAccount } from '../lib/accountDeletion.js';
import { verifyPassword } from '../lib/password.js';
import { parse } from '../lib/validation.js';
export const accountRouter = Router();
accountRouter.use(requireAuth);
accountRouter.delete('/', async (req, res) => {
  const { password } = parse(
    z
      .object({ password: z.string().min(1).max(128), confirmation: z.literal('DELETE') })
      .strict(),
    req.body,
  );
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return res.status(401).json({ message: 'Current password is incorrect.' });
  await AccountDeletion.init();
  try {
    await AccountDeletion.updateOne(
      { user: user._id },
      { $setOnInsert: { user: user._id } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const frozen = await User.updateOne(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { deleting: true, recoveryHash: '' } },
  );
  if (!frozen.matchedCount)
    return res
      .status(409)
      .json({ message: 'Account security changed. Sign in again before continuing.' });
  if (!(await purgeAccount(user._id)))
    return res
      .status(202)
      .json({ message: 'Deletion started. Continue to finish removing owned projects.' });
  clearSessionCookie(res);
  res.status(204).end();
});
