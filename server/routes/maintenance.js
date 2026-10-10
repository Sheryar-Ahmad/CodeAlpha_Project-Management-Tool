import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { tokenHash } from '../middleware/auth.js';
import { AccountDeletion } from '../models/AccountDeletion.js';
import { purgeAccount } from '../lib/accountDeletion.js';
export const maintenanceRouter = Router();
maintenanceRouter.get('/', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const header = req.get('authorization') ?? '';
  if (
    !secret ||
    secret.length < 32 ||
    !timingSafeEqual(
      Buffer.from(tokenHash(header)),
      Buffer.from(tokenHash('Bearer ' + secret)),
    )
  )
    return res.status(401).json({ message: 'Maintenance authorization required.' });
  // Completed jobs are swept again to clean writes that were already in flight at deletion.
  const jobs = await AccountDeletion.find({
    lastSweptAt: { $lt: new Date(Date.now() - 3600000) },
  })
    .sort({ lastSweptAt: 1 })
    .limit(10)
    .lean();
  let completed = 0;
  for (const job of jobs) {
    if (await purgeAccount(job.user)) completed++;
    await AccountDeletion.updateOne(
      { _id: job._id },
      { $set: { lastSweptAt: new Date() } },
    );
  }
  res.json({ checked: jobs.length, completed });
});
