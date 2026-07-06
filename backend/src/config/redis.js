import { createClient } from 'redis';
import Redis            from 'ioredis';

// ── node-redis client ─────────────────────────────────────────────────────────

let cacheClient  = null;
let pubClient    = null;
let subClient    = null;

export const connectRedis = async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const isTLS    = redisUrl.startsWith('rediss://');

  const makeClient = () => createClient({
    url:    redisUrl,
    socket: {
      tls:                isTLS,
      rejectUnauthorized: false,
      reconnectStrategy:  (retries) => {
        if (retries > 10) return new Error('Redis max retries reached');
        return Math.min(retries * 200, 3000);
      },
    },
  });

  // Three separate clients :
  cacheClient = makeClient();
  pubClient   = makeClient();
  subClient   = makeClient();

  cacheClient.on('error', (e) => console.error('Redis cache error:', e.message));
  pubClient.on('error',   (e) => console.error('Redis pub error:',   e.message));
  subClient.on('error',   (e) => console.error('Redis sub error:',   e.message));

  await Promise.all([
    cacheClient.connect(),
    pubClient.connect(),
    subClient.connect(),
  ]);

  console.log('✅ Redis connected (cache + pub + sub clients)');
};

export const getCacheClient = () => {
  if (!cacheClient) throw new Error('Redis cache client not initialized');
  return cacheClient;
};

export const getPubClient = () => {
  if (!pubClient) throw new Error('Redis pub client not initialized');
  return pubClient;
};

export const getSubClient = () => {
  if (!subClient) throw new Error('Redis sub client not initialized');
  return subClient;
};

// ── ioredis client ────────────────────────────────────────────────────────────
// Used exclusively by BullMQ 
let ioRedisClient = null;

export const getIORedis = () => {
  if (ioRedisClient) return ioRedisClient;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  ioRedisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    // maxRetriesPerRequest: null is REQUIRED by BullMQ
    // Without this, BullMQ throws an error on startup
    enableReadyCheck: false,
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  ioRedisClient.on('error', (e) => console.error('ioRedis error:', e.message));
  ioRedisClient.on('ready', ()  => console.log('✅ ioRedis (BullMQ) connected'));

  return ioRedisClient;
};