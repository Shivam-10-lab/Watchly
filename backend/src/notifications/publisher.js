import { getChannel, EXCHANGES, QUEUES } from '../config/rabbitmq.js';

// ── publishNotification ────────────────────────────────────────────────────
// Publishes a notification request to RabbitMQ.

export const publishNotification = async (event, payload) => {
  try {
    const channel = getChannel();
    if (!channel) {
      console.warn('RabbitMQ channel not available — skipping notification');
      return;
    }

    const message = {
      event,
      payload,
      publishedAt: new Date().toISOString(),
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));

    // Route to email queue
    if (payload.notifications?.email?.enabled !== false) {
      channel.publish(
        EXCHANGES.NOTIFICATIONS,
        QUEUES.NOTIFICATION_EMAIL,
        // Routing key matches the queue binding we set up in rabbitmq.js
        messageBuffer,
        {
          persistent:  true,
          contentType: 'application/json',
        }
      );
    }

    // Route to webhook queue if configured
    if (
      payload.notifications?.webhook?.enabled === true &&
      payload.notifications?.webhook?.url
    ) {
      channel.publish(
        EXCHANGES.NOTIFICATIONS,
        QUEUES.NOTIFICATION_WEBHOOK,
        messageBuffer,
        {
          persistent:  true,
          contentType: 'application/json',
        }
      );
    }

    console.log(
      `📨 Notification published: ${event} ` +
      `for monitor ${payload.monitorId}`
    );

  } catch (err) {
    // Never throw from here — a notification failure must not affect
    // the check worker's health check results
    console.error('Failed to publish notification:', err.message);
  }
};