import 'dotenv/config';
import { connectDB }            from '../config/db.js';
import { connectRedis, getIORedis } from '../config/redis.js';
import { connectRabbitMQ, getChannel } from '../config/rabbitmq.js';
import { startCheckWorker }     from '../queues/workers/check.worker.js';
import { startAnalyticsWorker } from '../queues/workers/analytics.worker.js';
import { startEmailConsumer }   from '../notifications/consumers/email.consumer.js';
import { startWebhookConsumer } from '../notifications/consumers/webhook.consumer.js';
import { scheduleAnalyticsJobs }from '../queues/jobs/scheduleAnalytics.js';

const startWorker = async () => {
  try {
    console.log('\n🔧 Starting Watchly Worker Process...\n');

    await connectDB();
    await connectRedis();
    await connectRabbitMQ();

    const ioRedisConn = getIORedis();

    // ── Start BullMQ workers ──────────────────────────────────────────────
    const checkWorker     = startCheckWorker(ioRedisConn);
    const analyticsWorker = startAnalyticsWorker(ioRedisConn);

    // ── Schedule the analytics cron job ──────────────────────────────────
    await scheduleAnalyticsJobs();

    // ── Start RabbitMQ consumers ──────────────────────────────────────────
    const channel = getChannel();
    if (channel) {
      await startEmailConsumer(channel);
      await startWebhookConsumer(channel);
    } else {
      console.warn('⚠️  RabbitMQ unavailable — notifications disabled');
    }

    console.log('\n✅ All workers started successfully');
    console.log('   • Check worker    — health checks every N seconds');
    console.log('   • Analytics worker — uptime aggregation every hour');
    console.log('   • Email consumer   — alert email dispatch');
    console.log('   • Webhook consumer — webhook delivery with retry');
    console.log('\nPress Ctrl+C to stop gracefully.\n');

    // ── Graceful shutdown ─────────────────────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);
      try {
        await checkWorker.close();
        await analyticsWorker.close();
        console.log('✅ BullMQ workers stopped');

        const { closeRabbitMQ } = await import('../config/rabbitmq.js');
        await closeRabbitMQ();
        console.log('✅ RabbitMQ disconnected');

        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('uncaughtException',  err => console.error('Uncaught:', err));
    process.on('unhandledRejection', err => console.error('Unhandled:', err));

  } catch (err) {
    console.error('❌ Worker failed to start:', err.message);
    process.exit(1);
  }
};

startWorker();