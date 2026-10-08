import { createHash } from 'node:crypto';
import { RateBucket } from '../models/RateBucket.js';

// Counters live in MongoDB so limits survive separate serverless instances.
// Fixed windows may allow bursts around a window boundary.
export class MongoRateStore {
  localKeys = false;
  constructor(prefix) {
    this.prefix = prefix;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  bucket(key) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const digest = createHash('sha256').update(key).digest('hex');
    return {
      key: this.prefix + ':' + digest + ':' + start,
      resetTime: new Date(start + this.windowMs),
    };
  }
  async increment(key) {
    const bucket = this.bucket(key);
    let record;
    try {
      record = await RateBucket.findOneAndUpdate(
        { key: bucket.key },
        { $inc: { hits: 1 }, $setOnInsert: { expiresAt: bucket.resetTime } },
        { upsert: true, returnDocument: 'after' },
      ).lean();
    } catch (error) {
      // Concurrent upserts can race on the unique key; retry the increment.
      if (error.code !== 11000) throw error;
      record = await RateBucket.findOneAndUpdate(
        { key: bucket.key },
        { $inc: { hits: 1 } },
        { returnDocument: 'after' },
      ).lean();
    }
    return { totalHits: record.hits, resetTime: bucket.resetTime };
  }
  async decrement(key) {
    await RateBucket.updateOne(
      { key: this.bucket(key).key, hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }
  async resetKey(key) {
    await RateBucket.deleteOne({ key: this.bucket(key).key });
  }
}
