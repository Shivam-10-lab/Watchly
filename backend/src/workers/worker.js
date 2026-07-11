import 'dotenv/config';
import { connectDB }       from '../config/db.js';
import { connectRedis, getIORedis }   from '../config/redis.js';
import { connectRabbitMQ } from '../config/rabbitmq.js';
import { startCheckWorker } from '../queues/workers/check.worker.js';

const startWorker = async () => {
  try {
    console.log('\n🔧 Starting Watchly Worker Process...\n');

    // Workers need their own connections to every service
    await connectDB();
    await connectRedis();
    await connectRabbitMQ();

    // Get the ioredis connection that BullMQ requires
    const ioRedisConn = getIORedis();

    // Start the check worker
    const checkWorker = startCheckWorker(ioRedisConn);

    // We will add analyticsWorker in Chunk 6
    // const analyticsWorker = startAnalyticsWorker(ioRedisConn);

    console.log('\n✅ Worker running. Waiting for jobs...');
    console.log('Press Ctrl+C to stop.\n');

    // ── Graceful shutdown ─────────────────────────────────────────────────
    // When you press Ctrl+C or the process is killed, we:
    // 1. Stop accepting new jobs (close the worker)
    // 2. Wait for the currently running check to finish
    // 3. Close all connections cleanly
    // This prevents a health check being cut off mid-flight
    // and leaving a CheckResult partially written.
    const shutdown = async (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);

      try {
        // Stop the worker (waits for in-progress jobs to complete)
        await checkWorker.close();
        console.log('✅ Check worker stopped');

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

    // Keep process alive — BullMQ event listeners are async
    // Without this, the process exits immediately after setup
    process.on('uncaughtException',  (err) => console.error('Uncaught exception:', err));
    process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

  } catch (err) {
    console.error('❌ Worker failed to start:', err.message);
    process.exit(1);
  }
};

startWorker();