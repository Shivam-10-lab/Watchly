import { Worker } from 'bullmq';
import mongoose   from 'mongoose';
import { Monitor, CheckResult } from '../../models/index.js';
import { performCheck }         from '../../utils/checker.utils.js';
import { processCheckResult }   from '../../utils/stateEngine.utils.js';
import { openIncident, closeIncident } from '../../services/incident.service.js';
import {
  publishStateChange,
  publishCheckResult,
}                               from '../../pubsub/publisher.js';
import {
  deleteCache,
  deleteCacheByPattern,
  CACHE_KEYS,
} from '../../utils/cache.utils.js';
import { QUEUE_NAMES }          from '../queues.js';

// ── startCheckWorker ───────────────────────────────────────────────────────
// Called once when the worker process starts.
// Returns the Worker instance (so the process can gracefully shut it down).
export const startCheckWorker = (ioRedisConnection) => {
  const worker = new Worker(
    QUEUE_NAMES.HEALTH_CHECKS,
    processCheckJob,
    {
      connection: ioRedisConnection,

      concurrency: parseInt(process.env.MAX_CONCURRENT_CHECKS) || 20,
      // Concurrency: how many checks can run simultaneously in this worker.
      
      // Lock duration: how long a worker "owns" a job before BullMQ
      lockDuration: 30000, // 30 seconds

      // Stalled check interval: how often BullMQ checks for stalled jobs
      stalledInterval: 30000,
    }
  );

  // ── Worker event listeners ──────────────────────────────────────────────
  worker.on('completed', (job) => {
    console.log(
      `✅ Check completed: monitor ${job.data.monitorId} ` +
      `[${job.data.url}] (job ${job.id})`
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `❌ Check failed: monitor ${job?.data.monitorId} ` +
      `[${job?.data.url}] — ${err.message} (job ${job?.id})`
    );
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled — will be retried`);
  });

  console.log(
    `✅ Check worker started ` +
    `(concurrency: ${process.env.MAX_CONCURRENT_CHECKS || 20})`
  );

  return worker;
};

// ── processCheckJob ────────────────────────────────────────────────────────

const processCheckJob = async (job) => {
  const { monitorId, workspaceId, url } = job.data;

  // ── Step 1: Load the fresh monitor config from MongoDB ──────────────────
  // Job data is stale — MongoDB is the source of truth.
  const monitor = await Monitor.findById(monitorId);

  if (!monitor) {
  
    // Returning early is correct — don't throw (no retry needed)
    console.warn(`Monitor ${monitorId} not found — skipping check`);
    return;
  }

  if (monitor.isPaused) {
    // Monitor was paused but job fired before removal (race condition)
    console.warn(`Monitor ${monitorId} is paused — skipping check`);
    return;
  }

  // ── Step 2: Run the HTTP health check ───────────────────────────────────
  console.log(`🔍 Checking: ${url} (monitor: ${monitorId})`);
  const checkResult = await performCheck(monitor);

  const checkedAt = new Date();

  // ── Step 3: Save the CheckResult to MongoDB ──────────────────────────────
  // We use insertOne directly (not mongoose create) because time-series
  // collections have restrictions on update/delete operations.
  // insertOne is always safe.
  await CheckResult.create({
    monitorId:       monitor._id,
    workspaceId:     monitor.workspaceId,
    checkedAt,
    status:          checkResult.status,
    statusCode:      checkResult.statusCode,
    responseTimeMs:  checkResult.responseTimeMs,
    keywordFound:    checkResult.keywordFound,
    sslValid:        checkResult.sslValid,
    sslDaysRemaining:checkResult.sslDaysRemaining,
    errorMessage:    checkResult.errorMessage,
  });

  // ── Step 4: Run the state engine ─────────────────────────────────────────
  const stateResult = processCheckResult(monitor, checkResult);

  // ── Step 5: Update the Monitor document ──────────────────────────────────
  const monitorUpdate = {
    lastCheckedAt:        checkedAt,
    lastResponseTimeMs:   checkResult.responseTimeMs,
    consecutiveFailures:  stateResult.newConsecutiveFailures,
    consecutiveSuccesses: stateResult.newConsecutiveSuccesses,
  };

  if (stateResult.stateChanged) {
    monitorUpdate.status            = stateResult.newStatus;
    monitorUpdate.lastStatusChangeAt = checkedAt;
  }

  await Monitor.findByIdAndUpdate(monitorId, monitorUpdate);

  // Invalidate monitor caches — status may have changed
  await deleteCache(CACHE_KEYS.monitor(monitorId));
  await deleteCache(CACHE_KEYS.monitors(workspaceId));
  await deleteCache(CACHE_KEYS.workspaceOverview(workspaceId));

  // ── Step 6: Handle state change (incidents + notifications) ──────────────
  let incidentId = null;

  if (stateResult.stateChanged) {
    console.log(
      `🔄 State change: monitor ${monitorId} ` +
      `${stateResult.previousStatus} → ${stateResult.newStatus}`
    );

    if (stateResult.shouldOpenIncident) {
      // Monitor went DOWN — open an incident
      const incident = await openIncident({
        monitorId:   monitor._id,
        workspaceId: monitor.workspaceId,
        checkResult,
      });
      incidentId = incident._id;

      // Publish to RabbitMQ so notification worker sends email/webhook
      // We import here to avoid circular dependencies
      const { publishNotification } = await import('../../notifications/publisher.js');
      await publishNotification('incident_opened', {
        workspaceId:  monitor.workspaceId.toString(),
        monitorId:    monitor._id.toString(),
        monitorName:  monitor.name,
        monitorUrl:   monitor.url,
        incidentId:   incident._id.toString(),
        statusCode:   checkResult.statusCode,
        errorMessage: checkResult.errorMessage,
        startedAt:    incident.startedAt.toISOString(),
        notifications:monitor.notifications,
      });

    } else if (stateResult.shouldCloseIncident) {
      // Monitor recovered — close the incident
      const incident = await closeIncident({
        monitorId:   monitor._id,
        workspaceId: monitor.workspaceId,
      });

      if (incident) {
        incidentId = incident._id;

        const { publishNotification } = await import('../../notifications/publisher.js');
        await publishNotification('incident_resolved', {
          workspaceId:     monitor.workspaceId.toString(),
          monitorId:       monitor._id.toString(),
          monitorName:     monitor.name,
          monitorUrl:      monitor.url,
          incidentId:      incident._id.toString(),
          durationSeconds: incident.durationSeconds,
          resolvedAt:      incident.resolvedAt.toISOString(),
          notifications:   monitor.notifications,
        });
      }
    }

    // ── Step 7: Publish to Redis pub/sub for WebSocket broadcast ───────────
    // This is what makes the dashboard update in real time
    await publishStateChange({
      workspaceId:    monitor.workspaceId,
      monitorId:      monitor._id,
      monitorName:    monitor.name,
      monitorUrl:     monitor.url,
      newStatus:      stateResult.newStatus,
      previousStatus: stateResult.previousStatus,
      incidentId,
      timestamp:      checkedAt.toISOString(),
    });
  }

  // ── Step 8: Always publish check result for response time chart ──────────
  // This fires on EVERY check, even when state doesn't change
  // The frontend uses it to update the live response time graph
  await publishCheckResult({
    workspaceId:    monitor.workspaceId,
    monitorId:      monitor._id,
    status:         checkResult.status,
    responseTimeMs: checkResult.responseTimeMs,
    statusCode:     checkResult.statusCode,
    checkedAt:      checkedAt.toISOString(),
  });

  return {
    monitorId,
    status:         checkResult.status,
    responseTimeMs: checkResult.responseTimeMs,
    stateChanged:   stateResult.stateChanged,
    newStatus:      stateResult.newStatus,
  };
};