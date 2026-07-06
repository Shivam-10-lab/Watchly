import rateLimit       from 'express-rate-limit';
import { RedisStore }  from 'rate-limit-redis';
import { getCacheClient } from '../config/redis.js';

// ── Helper: create a Redis-backed limiter ─────────────────────────────────
// Redis-backed means the counter is shared across all server instances.
// Without Redis: Server A counts your 5 requests, you switch to Server B
// and get 5 more. With Redis: all instances share the same counter.
const makeRedisLimiter = (options) => {
  return rateLimit({
    ...options,
    standardHeaders: true,   // Adds RateLimit-* headers to responses
    legacyHeaders:   false,   // Don't add X-RateLimit-* headers
    store: new RedisStore({
      // rate-limit-redis v4 uses sendCommand to talk to the redis client
      sendCommand: (...args) => getCacheClient().sendCommand(args),
    }),
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: options.message || 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
};

// ── Rate limiters ─────────────────────────────────────────────────────────

// Global: applies to all /api routes
// 200 requests per 15 minutes per IP
// Generous enough for normal use, blocks scrapers
export const generalLimiter = makeRedisLimiter({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  'Too many requests from this IP. Please try again in 15 minutes.',
});

// Auth routes: 10 attempts per 15 minutes per IP
// Prevents brute-force password guessing
// skipSuccessfulRequests: true — only counts failed attempts
export const authLimiter = makeRedisLimiter({
  windowMs:               15 * 60 * 1000,
  max:                    10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});

// Monitor creation: 30 per hour per user
// Prevents someone from creating thousands of monitors to abuse the system
// Uses userId (from JWT) as the key instead of IP
// — a single user behind a VPN wouldn't share the limit with others
export const monitorCreateLimiter = makeRedisLimiter({
  windowMs: 60 * 60 * 1000,
  max:      30,
  keyGenerator: (req) => req.user?.userId || req.ip,
  message: 'Monitor creation limit reached (30/hour). Please try again later.',
});

// Webhook endpoint (for receiving alerts FROM external services)
// Tighter limit to prevent abuse
export const webhookLimiter = makeRedisLimiter({
  windowMs: 60 * 1000,
  max:      60,
  message:  'Webhook rate limit exceeded.',
});

// API key usage: 1000 requests per hour per API key
// Programmatic access should be generous but still bounded
export const apiKeyLimiter = makeRedisLimiter({
  windowMs:     60 * 60 * 1000,
  max:          1000,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  message:      'API key rate limit exceeded (1000/hour).',
});