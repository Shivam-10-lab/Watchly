import axios from 'axios';
import { Notification } from '../../models/index.js';
import { assertWebhookUrlSafe } from '../../utils/ssrf.utils.js';
import { QUEUES } from '../../config/rabbitmq.js';

// ── Retry configuration ────────────────────────────────────────────────────
const MAX_RETRIES     = parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS) || 3;
const BASE_RETRY_DELAY = parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS) || 5000;

// ── startWebhookConsumer ───────────────────────────────────────────────────
export const startWebhookConsumer = async (channel) => {
  await channel.prefetch(1);

  console.log('🔗 Webhook consumer started — waiting for messages...');

  await channel.consume(
    QUEUES.NOTIFICATION_WEBHOOK,
    async (msg) => {
      if (!msg) return;

      let parsed;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch {
        console.error('Webhook consumer: malformed JSON — discarding');
        channel.nack(msg, false, false);
        return;
      }

      const { event, payload } = parsed;
      const webhookUrl = payload.notifications?.webhook?.url;

      if (!webhookUrl) {
        console.log('No webhook URL configured — skipping');
        channel.ack(msg);
        return;
      }

      console.log(
        `🔗 Processing webhook: ${event} → ${webhookUrl} ` +
        `(monitor: ${payload.monitorId})`
      );

      // ── SSRF protection ────────────────────────────────────────────────
     
      try {
        await assertWebhookUrlSafe(webhookUrl);
      } catch (ssrfErr) {
        console.error(
          `🚫 SSRF blocked webhook to ${webhookUrl}: ${ssrfErr.message}`
        );

        await Notification.create({
          workspaceId: payload.workspaceId,
          monitorId:   payload.monitorId,
          incidentId:  payload.incidentId,
          event,
          channel:     'webhook',
          recipient:   webhookUrl,
          status:      'failed',
          attempts:    1,
          lastError:   `SSRF_BLOCKED: ${ssrfErr.message}`,
          lastAttemptAt: new Date(),
        });

        // Discard — SSRF URLs should never be retried
        channel.nack(msg, false, false);
        return;
      }

      // ── Build webhook payload ──────────────────────────────────────────
      // Standard format that works with Slack incoming webhooks,
      // Discord webhooks, and any custom HTTP endpoint
      const webhookBody = buildWebhookPayload(event, payload);

      // ── Send with retry + exponential backoff ──────────────────────────
      let lastError = null;
      let attempts  = 0;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        attempts = attempt;
        try {
          await axios.post(webhookUrl, webhookBody, {
            timeout: 10000, // 10 second timeout per attempt
            headers: {
              'Content-Type':  'application/json',
              'User-Agent':    'Watchly-Webhook/1.0',
              'X-Watchly-Event': event,
            },
            // Don't follow too many redirects (webhook endpoints shouldn't redirect)
            maxRedirects: 3,
          });

          // Success
          await Notification.create({
            workspaceId: payload.workspaceId,
            monitorId:   payload.monitorId,
            incidentId:  payload.incidentId,
            event,
            channel:     'webhook',
            recipient:   webhookUrl,
            status:      'sent',
            attempts,
            sentAt:      new Date(),
          });

          channel.ack(msg);
          console.log(
            `✅ Webhook delivered to ${webhookUrl} ` +
            `(attempt ${attempt}/${MAX_RETRIES})`
          );
          return; // Exit the retry loop

        } catch (err) {
          lastError = err;
          console.error(
            `❌ Webhook attempt ${attempt}/${MAX_RETRIES} failed ` +
            `to ${webhookUrl}: ${err.message}`
          );

          if (attempt < MAX_RETRIES) {
            // Exponential backoff: 5s, 10s, 20s
            const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`   Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      // All retries exhausted
      console.error(
        `💀 Webhook permanently failed to ${webhookUrl} ` +
        `after ${MAX_RETRIES} attempts: ${lastError?.message}`
      );

      await Notification.create({
        workspaceId:   payload.workspaceId,
        monitorId:     payload.monitorId,
        incidentId:    payload.incidentId,
        event,
        channel:       'webhook',
        recipient:     webhookUrl,
        status:        'failed',
        attempts,
        lastAttemptAt: new Date(),
        lastError:     lastError?.message,
      });

      // nack with requeue:false — moved to dead-letter queue if configured
      // or simply discarded after all retries are exhausted
      channel.nack(msg, false, false);
    },
    { noAck: false }
  );
};

// ── Build the webhook payload ──────────────────────────────────────────────

const buildWebhookPayload = (event, payload) => {
  if (event === 'incident_opened') {
    return {
      // Slack-compatible format
      text: `🔴 *${payload.monitorName}* is DOWN`,
      attachments: [
        {
          color:  'danger',
          fields: [
            { title: 'URL',         value: payload.monitorUrl,    short: false },
            { title: 'Status Code', value: payload.statusCode?.toString() || 'No response', short: true },
            { title: 'Error',       value: payload.errorMessage || 'Connection failed', short: true },
            { title: 'Incident ID', value: payload.incidentId,   short: true },
            { title: 'Started At',  value: payload.startedAt,    short: true },
          ],
          footer:      'Watchly Monitor',
          footer_icon: 'https://watchly.dev/favicon.ico',
          ts:          Math.floor(Date.now() / 1000),
        },
      ],
      // Generic JSON format (for non-Slack endpoints)
      event,
      data: payload,
    };
  }

  if (event === 'incident_resolved') {
    const duration = formatDuration(payload.durationSeconds);
    return {
      text: `✅ *${payload.monitorName}* has recovered`,
      attachments: [
        {
          color:  'good',
          fields: [
            { title: 'URL',             value: payload.monitorUrl, short: false },
            { title: 'Downtime',        value: duration,           short: true  },
            { title: 'Incident ID',     value: payload.incidentId, short: true  },
            { title: 'Recovered At',    value: payload.resolvedAt, short: true  },
          ],
          footer: 'Watchly Monitor',
          ts:     Math.floor(Date.now() / 1000),
        },
      ],
      event,
      data: payload,
    };
  }

  // Fallback for unknown events
  return { event, data: payload, source: 'Watchly' };
};

const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown';
  if (seconds < 60)   return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};