import { Worker }  from 'bullmq';
import mongoose    from 'mongoose';
import {
  Monitor,
  CheckResult,
  UptimeStat,
} from '../../models/index.js';
import {
  deleteCache,
  CACHE_KEYS,
} from '../../utils/cache.utils.js';
import { QUEUE_NAMES } from '../queues.js';

// ── startAnalyticsWorker ───────────────────────────────────────────────────
export const startAnalyticsWorker = (ioRedisConnection) => {
  const worker = new Worker(
    QUEUE_NAMES.ANALYTICS,
    processAnalyticsJob,
    {
      connection:  ioRedisConnection,
      concurrency: 1,
      // concurrency: 1 for analytics — this is a heavy aggregation job
 
    }
  );

  worker.on('completed', (job) => {
    console.log(`✅ Analytics job completed (job ${job.id})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Analytics job failed:`, err.message);
  });

  console.log('✅ Analytics worker started');
  return worker;
};

// ── processAnalyticsJob ────────────────────────────────────────────────────
const processAnalyticsJob = async (job) => {
  console.log('📊 Running hourly analytics aggregation...');
  const startTime = Date.now();

  // The hour we're aggregating
  const now         = new Date();
  const currentHour = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()
  );
  // We aggregate the PREVIOUS hour (which is now complete)
  const targetHour  = new Date(currentHour.getTime() - 60 * 60 * 1000);
  const nextHour    = currentHour;

  console.log(`📊 Aggregating hour: ${targetHour.toISOString()}`);

  // Get all active monitors
  const monitors = await Monitor.find({ isPaused: false }).lean();
  console.log(`📊 Processing ${monitors.length} monitors...`);

  let processed = 0;
  let errors    = 0;

  for (const monitor of monitors) {
    try {
      await aggregateMonitorHour(monitor, targetHour, nextHour);
      processed++;
    } catch (err) {
      errors++;
      console.error(
        `Analytics error for monitor ${monitor._id}:`,
        err.message
      );
    }
  }

  const duration = Date.now() - startTime;
  console.log(
    `📊 Analytics complete: ${processed} monitors processed, ` +
    `${errors} errors, took ${duration}ms`
  );

  return { processed, errors, duration };
};

// ── aggregateMonitorHour ────────────────────────────────────────────────────
// Computes uptime stats for ONE monitor for ONE hour
// and saves/updates the UptimeStat document for that hour.
const aggregateMonitorHour = async (monitor, startHour, endHour) => {
  // MongoDB aggregation pipeline to compute stats from CheckResults
  const results = await CheckResult.aggregate([
    {
      // Step 1: Filter to only this monitor's checks in this hour
      $match: {
        monitorId: new mongoose.Types.ObjectId(monitor._id),
        checkedAt: {
          $gte: startHour,
          $lt:  endHour,
        },
      },
    },
    {
      // Step 2: Compute aggregate values in one pass
      $group: {
        _id: null,

        totalChecks:    { $sum: 1 },

        upChecks:       { $sum: { $cond: [{ $eq: ['$status', 'UP']       }, 1, 0] } },
        downChecks:     { $sum: { $cond: [{ $eq: ['$status', 'DOWN']     }, 1, 0] } },
        degradedChecks: { $sum: { $cond: [{ $eq: ['$status', 'DEGRADED'] }, 1, 0] } },

        avgResponseMs:  { $avg: '$responseTimeMs' },
        minResponseMs:  { $min: '$responseTimeMs' },
        maxResponseMs:  { $max: '$responseTimeMs' },

        // Collect all response times for percentile calculation
        // Note: $push collects into an array — only viable because we're
        // looking at one hour of data (max ~120 values for 30s interval)
        responseTimes:  { $push: '$responseTimeMs' },
      },
    },
    {
      // Step 3: Compute uptime percentage and add computed fields
      $project: {
        totalChecks:    1,
        upChecks:       1,
        downChecks:     1,
        degradedChecks: 1,
        avgResponseMs:  { $round: ['$avgResponseMs', 2] },
        minResponseMs:  1,
        maxResponseMs:  1,
        responseTimes:  1,
        uptimePercent: {
          $cond: [
            { $eq: ['$totalChecks', 0] },
            100, // No checks = assume up (monitor was paused, etc.)
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ['$upChecks', '$totalChecks'] },
                    100,
                  ],
                },
                2,
              ],
            },
          ],
        },
      },
    },
  ]);

  // No checks in this hour (monitor might have been paused)
  if (results.length === 0) {
    return;
  }

  const stats = results[0];

  // ── Compute percentiles from response times ──────────────────────────────
  // Sort the response times array and pick the p50 and p95 values
  const responseTimes = (stats.responseTimes || [])
    .filter(t => t !== null && t !== undefined)
    .sort((a, b) => a - b);

  let p50ResponseMs = null;
  let p95ResponseMs = null;

  if (responseTimes.length > 0) {
    p50ResponseMs = percentile(responseTimes, 50);
    p95ResponseMs = percentile(responseTimes, 95);
  }

  // ── Upsert the UptimeStat document ─────────────────────────────────────
  // upsert: true means "create if not exists, update if exists"
  // This is safe to call multiple times for the same hour
  // (idempotent — running the same cron job twice gives the same result)
  await UptimeStat.findOneAndUpdate(
    {
      monitorId: monitor._id,
      hour:      startHour,
    },
    {
      monitorId:      monitor._id,
      workspaceId:    monitor.workspaceId,
      hour:           startHour,
      totalChecks:    stats.totalChecks,
      upChecks:       stats.upChecks,
      downChecks:     stats.downChecks,
      degradedChecks: stats.degradedChecks,
      uptimePercent:  stats.uptimePercent,
      avgResponseMs:  stats.avgResponseMs,
      minResponseMs:  stats.minResponseMs,
      maxResponseMs:  stats.maxResponseMs,
      p50ResponseMs,
      p95ResponseMs,
    },
    {
      upsert:    true,
      new:       true,
      setDefaultsOnInsert: true,
    }
  );

  // Invalidate cached stats for this monitor — fresh data available
  await deleteCache(CACHE_KEYS.uptimeStats(monitor._id.toString(), '24h'));
  await deleteCache(CACHE_KEYS.uptimeStats(monitor._id.toString(), '7d'));
  await deleteCache(CACHE_KEYS.uptimeStats(monitor._id.toString(), '30d'));
};

// ── percentile ─────────────────────────────────────────────────────────────
// Given a sorted array of numbers, return the Nth percentile value.
// p50 = median, p95 = 95th percentile (95% of requests are faster than this)
const percentile = (sortedArr, p) => {
  if (sortedArr.length === 0) return null;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
};