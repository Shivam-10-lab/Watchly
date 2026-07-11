import { Incident, Monitor, CheckResult } from '../models/index.js';
import {
  getOrSet,
  deleteCache,
  deleteCacheByPattern,
  CACHE_KEYS,
  CACHE_TTL,
} from '../utils/cache.utils.js';

// ── openIncident ───────────────────────────────────────────────────────────
// Called by the check worker when a monitor transitions to DOWN
export const openIncident = async ({ monitorId, workspaceId, checkResult }) => { 
  // Check if there's already an open incident for this monitor
  // (safeguard against duplicate incidents from race conditions)
  const existing = await Incident.findOne({
    monitorId,
    status: 'ongoing',
  });

  if (existing) {
    console.log(`Incident already open for monitor ${monitorId} (${existing._id})`);
    return existing;
  }

  const incident = await Incident.openIncident({
    monitorId,
    workspaceId,
    statusCode:   checkResult.statusCode,
    errorMessage: checkResult.errorMessage,
  });

  console.log(
    `🔴 Incident opened: ${incident._id} ` +
    `for monitor ${monitorId} ` +
    `(${checkResult.errorMessage || `HTTP ${checkResult.statusCode}`})`
  );

  // Invalidate incident caches
  await deleteCache(CACHE_KEYS.activeIncidents(workspaceId));

  return incident;
};

// ── closeIncident ──────────────────────────────────────────────────────────
// Called by the check worker when a monitor recovers
export const closeIncident = async ({ monitorId, workspaceId }) => {
  const incident = await Incident.findOne({
    monitorId,
    status: 'ongoing',
  });

  if (!incident) {
    // No open incident to close — this can happen if the incident was
    // manually resolved before the monitor recovered
    console.log(`No open incident found for monitor ${monitorId} to close`);
    return null;
  }

  await incident.resolve();

  console.log(
    `✅ Incident closed: ${incident._id} ` +
    `for monitor ${monitorId} ` +
    `(duration: ${incident.durationSeconds}s)`
  );

  await deleteCache(CACHE_KEYS.activeIncidents(workspaceId));

  return incident;
};

// ── getIncidents ───────────────────────────────────────────────────────────
// With cursor-based pagination — incidents list can grow very large
export const getIncidents = async ({
  workspaceId,
  monitorId,
  status,
  cursor,
  limit = 20,
}) => {
  const filter = { workspaceId };
  if (monitorId) filter.monitorId = monitorId;
  if (status)    filter.status    = status;

  // Cursor pagination — faster than offset for large collections
  if (cursor) {
    filter._id = { $lt: cursor };
  }

  const incidents = await Incident.find(filter)
    .populate('monitorId',       'name url')
    .populate('acknowledgedBy',  'name email')
    .sort({ _id: -1 }) // newest first
    .limit(limit + 1)  // fetch one extra to know if there's a next page
    .lean();

  const hasNextPage = incidents.length > limit;
  const items       = hasNextPage ? incidents.slice(0, limit) : incidents;
  const nextCursor  = hasNextPage ? items[items.length - 1]._id : null;

  return { items, nextCursor, hasNextPage };
};

// ── getActiveIncidents ─────────────────────────────────────────────────────
// All currently ongoing incidents — used for dashboard alert banner
export const getActiveIncidents = async (workspaceId) => {
  return getOrSet(
    CACHE_KEYS.activeIncidents(workspaceId),
    () => Incident.find({ workspaceId, status: 'ongoing' })
      .populate('monitorId', 'name url')
      .sort({ startedAt: -1 })
      .lean(),
    CACHE_TTL.INCIDENTS
  );
};

// ── getIncidentById ────────────────────────────────────────────────────────
export const getIncidentById = async (incidentId, workspaceId) => {
  const incident = await Incident.findOne({ _id: incidentId, workspaceId })
    .populate('monitorId',      'name url intervalSeconds')
    .populate('acknowledgedBy', 'name email');

  if (!incident) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }

  return incident;
};

// ── acknowledgeIncident ────────────────────────────────────────────────────
// "I know about this — I'm looking into it"
// Does not close the incident, just marks it as seen
export const acknowledgeIncident = async ({
  incidentId,
  workspaceId,
  userId,
}) => {
  const incident = await Incident.findOne({
    _id:      incidentId,
    workspaceId,
    status:   'ongoing',
  });

  if (!incident) {
    const err = new Error('Active incident not found');
    err.status = 404;
    throw err;
  }

  if (incident.acknowledged) {
    const err = new Error('Incident already acknowledged');
    err.status = 400;
    throw err;
  }

  incident.acknowledged   = true;
  incident.acknowledgedBy = userId;
  incident.acknowledgedAt = new Date();
  await incident.save();

  await deleteCache(CACHE_KEYS.activeIncidents(workspaceId));

  return incident;
};

// ── updatePostmortem ───────────────────────────────────────────────────────
export const updatePostmortem = async ({
  incidentId,
  workspaceId,
  postmortem,
}) => {
  const incident = await Incident.findOneAndUpdate(
    { _id: incidentId, workspaceId },
    { postmortem },
    { new: true }
  );

  if (!incident) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }

  return incident;
};