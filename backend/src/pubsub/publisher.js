import { getPubClient } from '../config/redis.js';

// ── Channel name ───────────────────────────────────────────────────────────
// All monitor state changes are published to this single channel.
// The subscriber filters by workspaceId to route to the right Socket.io room.
export const STATE_CHANGE_CHANNEL = 'monitor:state_changes';

// ── publishStateChange ─────────────────────────────────────────────────────
// Called by the check worker after every state transition.

export const publishStateChange = async ({
  workspaceId,
  monitorId,
  monitorName,
  monitorUrl,
  newStatus,
  previousStatus,
  incidentId,
  timestamp,
}) => {
  try {
    const client  = getPubClient();
    const message = JSON.stringify({
      workspaceId:    workspaceId.toString(),
      monitorId:      monitorId.toString(),
      monitorName,
      monitorUrl,
      newStatus,
      previousStatus,
      incidentId:     incidentId?.toString() || null,
      timestamp:      timestamp || new Date().toISOString(),
    });

    await client.publish(STATE_CHANGE_CHANNEL, message);

    console.log(
      `📡 Published state change: monitor ${monitorId} ` +
      `${previousStatus} → ${newStatus}`
    );
  } catch (err) {
    // Log but never throw — a pub/sub failure must not break health checking
    console.error('Failed to publish state change:', err.message);
  }
};

// ── publishCheckResult ─────────────────────────────────────────────────────
// Publishes every check result (not just state changes) so the dashboard
// can update response time charts in real time.
// Separate channel so the subscriber can handle them differently.
export const CHECK_RESULT_CHANNEL = 'monitor:check_results';

export const publishCheckResult = async ({
  workspaceId,
  monitorId,
  status,
  responseTimeMs,
  statusCode,
  checkedAt,
}) => {
  try {
    const client  = getPubClient();
    const message = JSON.stringify({
      workspaceId:   workspaceId.toString(),
      monitorId:     monitorId.toString(),
      status,
      responseTimeMs,
      statusCode,
      checkedAt:     checkedAt || new Date().toISOString(),
    });

    await client.publish(CHECK_RESULT_CHANNEL, message);
  } catch (err) {
    console.error('Failed to publish check result:', err.message);
  }
};