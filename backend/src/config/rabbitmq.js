import amqp from 'amqplib';

let connection = null;
let channel    = null;

// ── Queue and exchange names ──────────────────────────────────────────────────
// Keep all names in one place — never use string literals in other files
export const QUEUES = {
  NOTIFICATION_EMAIL:   'notification.email',
  NOTIFICATION_WEBHOOK: 'notification.webhook',
};

export const EXCHANGES = {
  NOTIFICATIONS: 'notifications',
};

// ── Connect ───────────────────────────────────────────────────────────────────
export const connectRabbitMQ = async (retries = 5) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      connection = await amqp.connect(url);
      channel    = await connection.createChannel();

      // Direct exchange — route messages to a specific queue by name
      await channel.assertExchange(EXCHANGES.NOTIFICATIONS, 'direct', {
        durable: true,
      });

      // Declare both queues as durable so they survive RabbitMQ restarts
      await channel.assertQueue(QUEUES.NOTIFICATION_EMAIL,   { durable: true });
      await channel.assertQueue(QUEUES.NOTIFICATION_WEBHOOK, { durable: true });

      // Bind each queue to the exchange with a routing key matching the queue name
      // This means: messages published with routingKey='notification.email'
      // go to the email queue, and 'notification.webhook' go to the webhook queue
      await channel.bindQueue(
        QUEUES.NOTIFICATION_EMAIL,
        EXCHANGES.NOTIFICATIONS,
        QUEUES.NOTIFICATION_EMAIL
      );
      await channel.bindQueue(
        QUEUES.NOTIFICATION_WEBHOOK,
        EXCHANGES.NOTIFICATIONS,
        QUEUES.NOTIFICATION_WEBHOOK
      );

      connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err.message);
      });

      connection.on('close', () => {
        console.warn('RabbitMQ connection closed — reconnecting in 5s...');
        setTimeout(connectRabbitMQ, 5000);
      });

      console.log('✅ RabbitMQ connected');
      return channel;

    } catch (err) {
      console.error(`RabbitMQ attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt === retries) {
        console.error('RabbitMQ unavailable — notifications will not work');
        return null;
      }
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
};

export const getChannel = () => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
};

export const closeRabbitMQ = async () => {
  try {
    await channel?.close();
    await connection?.close();
  } catch { /* ignore shutdown errors */ }
};