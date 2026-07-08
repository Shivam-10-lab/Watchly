import { getCheckQueue } from '../queues.js';

// ── Job ID convention ──────────────────────────────────────────────────────
// Deterministic and unique per monitor.
// Using the monitorId as part of the job key means:
// - No duplicate jobs even if registration is called twice
// - Easy to find and remove the job when deleting a monitor
const getJobKey = (monitorId) => `monitor-check-${monitorId}`;

// ── Register (or re-register) a repeatable health check job ───────────────
// Safe to call multiple times for the same monitor — BullMQ deduplicates
// based on the repeat key. If the interval changes, we remove the old
// job first and create a new one.
export const registerMonitorJob = async (monitor) => {
  if (monitor.isPaused) {
    console.log(`Skipping job registration for paused monitor: ${monitor._id}`);
    return;
  }

  const queue    = getCheckQueue();
  const jobKey   = getJobKey(monitor._id.toString());
  const intervalMs = monitor.intervalSeconds * 1000;

  // Remove any existing repeatable job for this monitor first
  // This handles the "update interval" case cleanly
  await removeMonitorJob(monitor._id);

  // Register the new repeatable job
  await queue.add(
    'check-monitor',
    {
      // Job payload — available inside the worker as job.data
      monitorId:   monitor._id.toString(),
      workspaceId: monitor.workspaceId.toString(),
      url:         monitor.url,
      // We store the URL here too so the worker can log it
      // without doing a DB lookup just for logging
    },
    {
      repeat: {
        every: intervalMs,
        // 'every' means "run this job every N milliseconds starting now"
        // Distinct from 'cron' which uses cron syntax
        // 'every' is simpler and more predictable for fixed intervals
      },

      jobId: jobKey,
      // jobId on a repeatable job sets the repeat key.
      // BullMQ uses this to identify the repeat pattern in Redis.
      // If you add two jobs with the same jobId, the second is ignored.
      // This is what makes server restarts safe.

      // Run the first check immediately (don't wait for the interval)
      // so users see a result right after creating the monitor
      delay: 0,
    }
  );

  console.log(
    `✅ Scheduled job for monitor ${monitor._id} ` +
    `(every ${monitor.intervalSeconds}s, URL: ${monitor.url})`
  );

  return jobKey;
};

// ── Remove a repeatable job (when monitor is deleted or paused) ────────────
export const removeMonitorJob = async (monitorId) => {
  const queue  = getCheckQueue();
  const jobKey = getJobKey(monitorId.toString());

  try {
    // Get all repeatable jobs for this queue
    const repeatableJobs = await queue.getRepeatableJobs();

    // Find the one matching our monitor
    const job = repeatableJobs.find(j => j.key.includes(jobKey));

    if (job) {
      await queue.removeRepeatableByKey(job.key);
      console.log(`🗑️  Removed scheduled job for monitor ${monitorId}`);
    }
  } catch (err) {
    // Log but don't throw — a failed job removal shouldn't block
    // the monitor deletion in MongoDB
    console.error(`Failed to remove job for monitor ${monitorId}:`, err.message);
  }
};

// ── Pause: removes job so checks stop ─────────────────────────────────────
export const pauseMonitorJob = async (monitorId) => {
  await removeMonitorJob(monitorId);
  console.log(`⏸️  Paused checks for monitor ${monitorId}`);
};

// ── Resume: re-registers the job ──────────────────────────────────────────
export const resumeMonitorJob = async (monitor) => {
  await registerMonitorJob(monitor);
  console.log(`▶️  Resumed checks for monitor ${monitor._id}`);
};

// ── List all active monitor jobs (useful for admin/debugging) ─────────────
export const listActiveMonitorJobs = async () => {
  const queue = getCheckQueue();
  const jobs  = await queue.getRepeatableJobs();

  return jobs.map(job => ({
    key:      job.key,
    next:     new Date(job.next).toISOString(),
    interval: job.every ? `${job.every / 1000}s` : job.pattern,
  }));
};