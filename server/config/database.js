import mongoose from 'mongoose';

let connectionPromise;
// Reuse warm serverless connections. Failed connections can be retried.
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    const error = new Error('Database is not configured.');
    error.status = 503;
    throw error;
  }
  connectionPromise ??= mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
    })
    .catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  await connectionPromise;
}
