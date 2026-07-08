import mongoose from 'mongoose';
import multer   from 'multer';
import { Monitor, Workspace }  from '../models/index.js';
import {
  registerMonitorJob,
  removeMonitorJob,
  pauseMonitorJob,
  resumeMonitorJob,
} from '../queues/jobs/registerMonitorJob.js';
import {
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPattern,
  getOrSet,
  CACHE_KEYS,
  CACHE_TTL,
} from '../utils/cache.utils.js';
import { cloudinary } from '../config/cloudinary.js';

// ── createMonitor ──────────────────────────────────────────────────────────
export const createMonitor = async ({ workspaceId, data }) => {
  // Check workspace monitor limit
  const workspace    = await Workspace.findById(workspaceId);
  const monitorCount = await Monitor.countDocuments({ workspaceId });

  if (monitorCount >= workspace.limits.maxMonitors) {
    const err = new Error(
      `Monitor limit reached (${workspace.limits.maxMonitors} on ${workspace.plan} plan). ` +
      `Delete an existing monitor or upgrade your plan.`
    );
    err.status = 403;
    throw err;
  }

  // Enforce minimum check interval based on plan
  if (data.intervalSeconds < workspace.limits.minCheckIntervalSecs) {
    const err = new Error(
      `Minimum check interval on ${workspace.plan} plan is ` +
      `${workspace.limits.minCheckIntervalSecs} seconds`
    );
    err.status = 400;
    throw err;
  }

  // Create the monitor in MongoDB
  const monitor = await Monitor.create({
    workspaceId,
    ...data,
    status: 'PENDING',
    // PENDING means "created but first check hasn't run yet"
    // The status will change to UP/DOWN after the first check
  });

  // Register the BullMQ repeatable job
  // This starts health checks immediately
  const jobKey = await registerMonitorJob(monitor);

  // Store the job key on the monitor for later removal
  monitor.schedulerJobId = jobKey;
  await monitor.save();

  // Invalidate the workspace's monitor list cache
  await deleteCache(CACHE_KEYS.monitors(workspaceId));

  return monitor;
};

// ── getMonitors ────────────────────────────────────────────────────────────
// Returns all monitors for a workspace with caching
export const getMonitors = async (workspaceId) => {
  return getOrSet(
    CACHE_KEYS.monitors(workspaceId),
    () => Monitor.find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean(),
    CACHE_TTL.MONITORS
  );
};

// ── getMonitorById ─────────────────────────────────────────────────────────
export const getMonitorById = async (monitorId, workspaceId) => {
  return getOrSet(
    CACHE_KEYS.monitor(monitorId),
    async () => {
      const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });
      if (!monitor) {
        const err = new Error('Monitor not found');
        err.status = 404;
        throw err;
      }
      return monitor;
    },
    CACHE_TTL.MONITOR
  );
};

// ── updateMonitor ──────────────────────────────────────────────────────────
export const updateMonitor = async (monitorId, workspaceId, updates) => {
  // Fields that trigger a job re-registration
  const jobAffectingFields = ['intervalSeconds', 'url', 'isPaused'];
  const needsJobUpdate = jobAffectingFields.some(
    field => updates[field] !== undefined
  );

  // Don't allow updating these fields through this function
  const { status, consecutiveFailures, consecutiveSuccesses,
          schedulerJobId, workspaceId: _, ...safeUpdates } = updates;

  const monitor = await Monitor.findOneAndUpdate(
    { _id: monitorId, workspaceId },
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  // Re-register the job if interval or URL changed
  if (needsJobUpdate && !monitor.isPaused) {
    await registerMonitorJob(monitor);
  }

  // Invalidate caches
  await deleteCache(CACHE_KEYS.monitor(monitorId));
  await deleteCache(CACHE_KEYS.monitors(workspaceId));

  return monitor;
};

// ── deleteMonitor ──────────────────────────────────────────────────────────
export const deleteMonitor = async (monitorId, workspaceId) => {
  const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });

  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  // Remove the BullMQ job FIRST
  // If this fails, we still try to delete from MongoDB
  await removeMonitorJob(monitorId);

  // Delete from MongoDB
  await Monitor.findByIdAndDelete(monitorId);

  // Invalidate caches
  await deleteCache(CACHE_KEYS.monitor(monitorId));
  await deleteCache(CACHE_KEYS.monitors(workspaceId));

  // Note: CheckResults and Incidents for this monitor are kept for history
  // They'll auto-expire due to the time-series TTL on CheckResults
  // Incidents are cheap to keep and provide historical value

  return { deleted: true, monitorId };
};

// ── pauseMonitor ───────────────────────────────────────────────────────────
export const pauseMonitor = async (monitorId, workspaceId) => {
  const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });

  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  if (monitor.isPaused) {
    const err = new Error('Monitor is already paused');
    err.status = 400;
    throw err;
  }

  // Stop the BullMQ job
  await pauseMonitorJob(monitorId);

  // Update status in MongoDB
  monitor.isPaused = true;
  monitor.status   = 'PAUSED';
  await monitor.save();

  await deleteCache(CACHE_KEYS.monitor(monitorId));
  await deleteCache(CACHE_KEYS.monitors(workspaceId));

  return monitor;
};

// ── resumeMonitor ──────────────────────────────────────────────────────────
export const resumeMonitor = async (monitorId, workspaceId) => {
  const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });

  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  if (!monitor.isPaused) {
    const err = new Error('Monitor is not paused');
    err.status = 400;
    throw err;
  }

  // Re-register the BullMQ job
  await resumeMonitorJob(monitor);

  // Update status to PENDING (first check will determine real status)
  monitor.isPaused = false;
  monitor.status   = 'PENDING';
  await monitor.save();

  await deleteCache(CACHE_KEYS.monitor(monitorId));
  await deleteCache(CACHE_KEYS.monitors(workspaceId));

  return monitor;
};

// ── uploadRunbook ──────────────────────────────────────────────────────────
// Uploads a PDF or markdown file to Cloudinary and stores the URL
export const uploadRunbook = async (monitorId, workspaceId, file) => {
  if (!file) {
    const err = new Error('No file provided');
    err.status = 400;
    throw err;
  }

  const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });
  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  // Convert buffer to base64 data URI for Cloudinary
  const b64     = Buffer.from(file.buffer).toString('base64');
  const dataURI = `data:${file.mimetype};base64,${b64}`;

  // Upload to Cloudinary
  const result = await cloudinary.uploader.upload(dataURI, {
    folder:        'watchly/runbooks',
    resource_type: 'raw',
    // 'raw' = not an image or video — used for PDF, markdown, txt etc.

    public_id: `runbook-${monitorId}`,
    // Deterministic public_id means uploading again replaces the old file
    // instead of creating a duplicate

    overwrite: true,
  });

  // Save the URL to the monitor
  monitor.runbookUrl = result.secure_url;
  await monitor.save();

  await deleteCache(CACHE_KEYS.monitor(monitorId));

  return {
    runbookUrl: result.secure_url,
    fileName:   file.originalname,
    fileSize:   file.size,
  };
};

// ── deleteRunbook ──────────────────────────────────────────────────────────
export const deleteRunbook = async (monitorId, workspaceId) => {
  const monitor = await Monitor.findOne({ _id: monitorId, workspaceId });
  if (!monitor) {
    const err = new Error('Monitor not found');
    err.status = 404;
    throw err;
  }

  if (!monitor.runbookUrl) {
    const err = new Error('This monitor has no runbook attached');
    err.status = 400;
    throw err;
  }

  // Delete from Cloudinary
  await cloudinary.uploader.destroy(`watchly/runbooks/runbook-${monitorId}`, {
    resource_type: 'raw',
  });

  monitor.runbookUrl = null;
  await monitor.save();

  await deleteCache(CACHE_KEYS.monitor(monitorId));

  return { deleted: true };
};

// ── getMonitorSummary ──────────────────────────────────────────────────────
// Quick dashboard overview — counts by status for a workspace
export const getMonitorSummary = async (workspaceId) => {
  return getOrSet(
    CACHE_KEYS.workspaceOverview(workspaceId),
    async () => {
      const [total, up, down, degraded, paused, pending] = await Promise.all([
        Monitor.countDocuments({ workspaceId }),
        Monitor.countDocuments({ workspaceId, status: 'UP' }),
        Monitor.countDocuments({ workspaceId, status: 'DOWN' }),
        Monitor.countDocuments({ workspaceId, status: 'DEGRADED' }),
        Monitor.countDocuments({ workspaceId, status: 'PAUSED' }),
        Monitor.countDocuments({ workspaceId, status: 'PENDING' }),
      ]);

      const allOperational = down === 0 && degraded === 0;

      return {
        total, up, down, degraded, paused, pending,
        allOperational,
        // Overall health: percentage of non-paused monitors that are UP
        healthScore: total > 0
          ? Math.round((up / (total - paused - pending)) * 100) || 100
          : 100,
      };
    },
    CACHE_TTL.WORKSPACE_OVERVIEW
  );
};

// ── multer config (exported so controller can use it as middleware) ─────────
export const runbookUpload = multer({
  storage: multer.memoryStorage(),
  // memoryStorage: file is stored in RAM as a Buffer
  // We then pass that buffer to Cloudinary
  // This avoids writing temporary files to disk

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },

  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'text/markdown',
      'text/plain',
      'text/x-markdown',
    ];
    const allowedExts = ['.pdf', '.md', '.txt', '.markdown'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and markdown files are allowed for runbooks'));
    }
  },
});