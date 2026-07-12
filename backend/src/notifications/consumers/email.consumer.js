import { Notification } from '../../models/index.js';
import { sendAlertEmail, sendRecoveryEmail } from '../../utils/email.utils.js';
import { QUEUES } from '../../config/rabbitmq.js';

// ── startEmailConsumer ─────────────────────────────────────────────────────
// Registers a callback that RabbitMQ calls whenever a message
// arrives in the email notification queue.

export const startEmailConsumer = async (channel) => {
  // prefetch(1): process one email at a time per consumer instance.
  
  await channel.prefetch(1);

  console.log('📧 Email consumer started — waiting for messages...');

  await channel.consume(
    QUEUES.NOTIFICATION_EMAIL,
    async (msg) => {
      if (!msg) return; // Consumer cancelled by RabbitMQ

      let parsed;

      // ── Parse the message ──────────────────────────────────────────────
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch {
        console.error('Email consumer: malformed JSON — discarding message');
        // nack with requeue:false — malformed messages can never succeed
        channel.nack(msg, false, false);
        return;
      }

      const { event, payload } = parsed;

      console.log(
        `📧 Processing email: ${event} ` +
        `for monitor ${payload.monitorId}`
      );

      // ── Build recipient list ───────────────────────────────────────────
   
      const recipients = payload.notifications?.email?.recipients || [];

      if (recipients.length === 0) {
        console.log('No email recipients configured — skipping');
        // Ack without sending — message is "done"
        channel.ack(msg);
        return;
      }

      // ── Determine dashboard URL ────────────────────────────────────────
      const dashboardUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/incidents/${payload.incidentId}`;

      // ── Send the email ─────────────────────────────────────────────────
      try {
        if (event === 'incident_opened') {
          await sendAlertEmail({
            to:           recipients,
            monitorName:  payload.monitorName,
            monitorUrl:   payload.monitorUrl,
            statusCode:   payload.statusCode,
            errorMessage: payload.errorMessage,
            incidentId:   payload.incidentId,
            dashboardUrl,
          });
        } else if (event === 'incident_resolved') {
          await sendRecoveryEmail({
            to:              recipients,
            monitorName:     payload.monitorName,
            monitorUrl:      payload.monitorUrl,
            durationSeconds: payload.durationSeconds,
            incidentId:      payload.incidentId,
            dashboardUrl,
          });
        } else {
          console.warn(`Unknown notification event: ${event} — discarding`);
          channel.ack(msg);
          return;
        }

        // ── Record successful send in MongoDB ──────────────────────────────
        await Notification.create({
          workspaceId: payload.workspaceId,
          monitorId:   payload.monitorId,
          incidentId:  payload.incidentId,
          event,
          channel:     'email',
          recipient:   recipients.join(', '),
          status:      'sent',
          attempts:    1,
          sentAt:      new Date(),
        });

        // ack = "processed successfully, remove from queue"
        // RabbitMQ deletes this message
        channel.ack(msg);
        console.log(`✅ Email sent for ${event} (monitor: ${payload.monitorId})`);

      } catch (err) {
        console.error(
          `❌ Email failed for ${event} (monitor: ${payload.monitorId}):`,
          err.message
        );

        // ── Record failure in MongoDB ──────────────────────────────────────
        try {
          await Notification.create({
            workspaceId:   payload.workspaceId,
            monitorId:     payload.monitorId,
            incidentId:    payload.incidentId,
            event,
            channel:       'email',
            recipient:     recipients.join(', '),
            status:        'failed',
            attempts:      1,
            lastAttemptAt: new Date(),
            lastError:     err.message,
          });
        } catch (dbErr) {
          console.error('Failed to record notification failure:', dbErr.message);
        }

        // nack with requeue:true — put back in queue for retry
        channel.nack(msg, false, true);
      }
    },
    {
      // noAck: false means we manually ack/nack messages
      noAck: false,
    }
  );
};