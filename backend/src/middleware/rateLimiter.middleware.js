import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { RedisStore }  from 'rate-limit-redis';
import { getCacheClient } from '../config/redis.js';

// ── Helper: create a Redis-backed limiter ─────────────────────────────────

const makeRedisLimiter = (options) => {
  return rateLimit({
    ...options,
    standardHeaders: true,   // Adds RateLimit-* headers to responses
    legacyHeaders:   false,   // Don't add X-RateLimit-* headers
    store: new RedisStore({
      sendCommand: (...args) => getCacheClient().sendCommand(args),
    }),
    handler: (req, res) => {    //This function is executed only when the rate limit has been exceeded.
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

export const generalLimiter = makeRedisLimiter({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  'Too many requests from this IP. Please try again in 15 minutes.',
});

// Auth routes: 10 attempts per 15 minutes per IP

export const authLimiter = makeRedisLimiter({
  windowMs:               15 * 60 * 1000,
  max:                    10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});

// Monitor creation: 30 per hour per user

export const monitorCreateLimiter = makeRedisLimiter({
  windowMs: 60 * 60 * 1000,
  max:      30,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
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

export const apiKeyLimiter = makeRedisLimiter({
  windowMs:     60 * 60 * 1000,
  max:          1000,
  keyGenerator: (req) => req.headers['x-api-key'] || ipKeyGenerator(req),
  message:      'API key rate limit exceeded (1000/hour).',
});