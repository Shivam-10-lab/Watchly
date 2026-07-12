import { getAnalyticsQueue } from '../queues.js';

// ── scheduleAnalyticsJobs ──────────────────────────────────────────────────
// Called once when the worker process starts.
// Registers the hourly analytics aggregation cron job.
export const scheduleAnalyticsJobs = async () => {
  const queue = getAnalyticsQueue();

  // Remove any existing job first to avoid duplicates on restart
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'aggregate-hourly-stats') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Register the cron job
  // Cron pattern: '0 * * * *' = "at minute 0 of every hour"
  // i.e. runs at 00:00, 01:00, 02:00, 03:00 ... 23:00 every day
  await queue.add(
    'aggregate-hourly-stats',
    {
      // No specific payload needed — the worker queries all monitors
      triggeredAt: new Date().toISOString(),
    },
    {
      repeat: { pattern: '0 * * * *' },
      jobId:  'hourly-stats-aggregator',
      // Unique jobId prevents duplicate cron registrations on restart
    }
  );

  console.log('✅ Analytics cron job scheduled (runs every hour at :00)');
};