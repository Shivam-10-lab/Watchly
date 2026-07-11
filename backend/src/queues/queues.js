import { Queue }    from 'bullmq';
import { getIORedis } from '../config/redis.js';

// ── Queue names ────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  HEALTH_CHECKS: 'health-checks',
  ANALYTICS:     'analytics',
};

// ── Queue instances ────────────────────────────────────────────────────────
// Created lazily — only when first accessed.

let checkQueue     = null;
let analyticsQueue = null;

export const getCheckQueue = () => {
  if (checkQueue) return checkQueue;

  checkQueue = new Queue(QUEUE_NAMES.HEALTH_CHECKS, {
    connection: getIORedis(),
    defaultJobOptions: {
      // How many times to retry a failed job before giving up
      attempts: 3,

      backoff: {
        type:  'exponential',
        delay: 2000,
        // Retry delays: 2s, 4s, 8s
      },

      // Remove completed jobs after 100 are stored
      removeOnComplete: { count: 100 },

      // Keep failed jobs for debugging (last 50)
      removeOnFail: { count: 50 },
    },
  });

  checkQueue.on('error', (err) => {
    console.error('Check queue error:', err.message);
  });

  return checkQueue;
};

export const getAnalyticsQueue = () => {
  if (analyticsQueue) return analyticsQueue;

  analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, {
    connection: getIORedis(),
    defaultJobOptions: {
      attempts:         2,
      backoff:          { type: 'fixed', delay: 5000 },
      removeOnComplete: { count: 20 },
      removeOnFail:     { count: 20 },
    },
  });

  analyticsQueue.on('error', (err) => {
    console.error('Analytics queue error:', err.message);
  });

  return analyticsQueue;
};