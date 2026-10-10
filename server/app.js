import { publicIntakeRouter } from './routes/intake.js';
import { accountRouter } from './routes/account.js';
import { maintenanceRouter } from './routes/maintenance.js';
import { importsRouter } from './routes/imports.js';
import { teamRouter } from './routes/teams.js';
import { workLogRouter } from './routes/workLogs.js';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { connectDatabase } from './config/database.js';
import { requireTrustedOrigin } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { taskRouter } from './routes/tasks.js';
import { projectRouter } from './routes/projects.js';
import { MongoRateStore } from './lib/rateStore.js';
export const app = express();
app.disable('x-powered-by');
// Vercel overwrites X-Forwarded-For. Trust its direct proxy only on Vercel.
// https://vercel.com/docs/headers/request-headers
if (process.env.VERCEL === '1') app.set('trust proxy', 1);
app.use(helmet());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', requireTrustedOrigin);
app.use('/api', async (req, res, next) => {
  await connectDatabase();
  // A browser may leave while the first database connection is warming up.
  if (req.socket.destroyed) return;
  next();
});
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: 120,
    store: new MongoRateStore('api'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' },
  }),
);
// Backup imports have their own bounded parser; ordinary mutation bodies stay small.
app.use('/api/imports', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/projects', projectRouter);
app.use('/api/work-logs', workLogRouter);
app.use('/api/teams', teamRouter);
app.use('/api/intake', publicIntakeRouter);
app.use('/api/imports', importsRouter);
app.use('/api/account', accountRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000)
    return res
      .status(409)
      .json({ message: 'This email is already registered. Try signing in.' });
  const status = error.status ?? (error.name === 'ValidationError' ? 400 : 500);
  const message =
    error.type === 'entity.parse.failed'
      ? 'Invalid JSON request body.'
      : error.type === 'entity.too.large'
        ? 'Request body is too large.'
        : status < 500
          ? error.message
          : 'Service unavailable. Please try again shortly.';
  if (status >= 500) console.error('API failure:', error.name);
  res
    .status(status)
    .json({ message, ...(error.details ? { details: error.details } : {}) });
});
export default app;
