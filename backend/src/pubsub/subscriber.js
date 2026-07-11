import { getSubClient }    from '../config/redis.js';
import { broadcastToWorkspace } from '../config/socket.js';
import {
  STATE_CHANGE_CHANNEL,
  CHECK_RESULT_CHANNEL,
} from './publisher.js';

// ── startSubscriber ────────────────────────────────────────────────────────
// Call this once at API server startup (in index.js)

export const startSubscriber = async () => {
  const client = getSubClient();

  // ── Subscribe to state change channel ───────────────────────────────────
  // These are high-priority messages — a monitor just went DOWN or recovered
  await client.subscribe(STATE_CHANGE_CHANNEL, (message) => {
    try {
      const event = JSON.parse(message);

      console.log(
        `📬 Received state change: workspace ${event.workspaceId} ` +
        `monitor ${event.monitorId} → ${event.newStatus}`
      );

      // Broadcast to every browser tab viewing this workspace's dashboard
      // The Socket.io room is named workspace:{workspaceId}
      // Clients join this room when they open the dashboard (see socket.js)
      broadcastToWorkspace(
        event.workspaceId,
        'monitor:status_changed',
        // This is the event name the frontend listens for
        {
          monitorId:      event.monitorId,
          monitorName:    event.monitorName,
          monitorUrl:     event.monitorUrl,
          newStatus:      event.newStatus,
          previousStatus: event.previousStatus,
          incidentId:     event.incidentId,
          timestamp:      event.timestamp,
        }
      );

      // If a new incident opened, also emit a separate incident event
      // so the frontend can add it to the incident list without refetching
      if (event.newStatus === 'DOWN' && event.incidentId) {
        broadcastToWorkspace(
          event.workspaceId,
          'incident:opened',
          {
            incidentId:  event.incidentId,
            monitorId:   event.monitorId,
            monitorName: event.monitorName,
            startedAt:   event.timestamp,
          }
        );
      }

      // If monitor recovered, emit incident resolved event
      if (
        (event.newStatus === 'UP' || event.newStatus === 'DEGRADED') &&
        event.previousStatus === 'DOWN' &&
        event.incidentId
      ) {
        broadcastToWorkspace(
          event.workspaceId,
          'incident:resolved',
          {
            incidentId:  event.incidentId,
            monitorId:   event.monitorId,
            monitorName: event.monitorName,
            resolvedAt:  event.timestamp,
          }
        );
      }

    } catch (err) {
      console.error('Error processing state change message:', err.message);
    }
  });

  // ── Subscribe to check result channel ───────────────────────────────────
  // These fire on EVERY check (every 30s-30min per monitor)
  // Used to update response time charts on the dashboard in real time
  await client.subscribe(CHECK_RESULT_CHANNEL, (message) => {
    try {
      const event = JSON.parse(message);

      // Broadcast the check result to the workspace
      // The frontend uses this to append a data point to the response time chart
      broadcastToWorkspace(
        event.workspaceId,
        'monitor:check_completed',
        {
          monitorId:     event.monitorId,
          status:        event.status,
          responseTimeMs:event.responseTimeMs,
          statusCode:    event.statusCode,
          checkedAt:     event.checkedAt,
        }
      );

    } catch (err) {
      console.error('Error processing check result message:', err.message);
    }
  });

  console.log('✅ Redis pub/sub subscriber started');
  console.log(`   Listening on channels:`);
  console.log(`   - ${STATE_CHANGE_CHANNEL}`);
  console.log(`   - ${CHECK_RESULT_CHANNEL}`);
};