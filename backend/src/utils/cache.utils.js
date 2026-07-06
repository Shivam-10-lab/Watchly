import { getCacheClient } from '../config/redis.js';

// ── Core operations ────────────────────────────────────────────────────────

export const getCache = async (key) => {
  try {
    const client = getCacheClient();
    const value  = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    // Cache errors should never crash the app
    // On error, return null and fall through to the DB
    console.error(`Cache GET error [${key}]:`, err.message);
    return null;
  }
};

export const setCache = async (key, value, ttlSeconds = 300) => {
  try {
    const client = getCacheClient();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    // A failed cache write should never block the response
    console.error(`Cache SET error [${key}]:`, err.message);
  }
};

export const deleteCache = async (key) => {
  try {
    const client = getCacheClient();
    await client.del(key);
  } catch (err) {
    console.error(`Cache DEL error [${key}]:`, err.message);
  }
};

// Deletes all keys matching a glob pattern
// Used after writes that invalidate multiple cache entries
// e.g. deleteCacheByPattern('monitors:ws-abc123:*')
// deletes all monitor caches for workspace abc123
export const deleteCacheByPattern = async (pattern) => {
  try {
    const client = getCacheClient();
    let cursor   = '0';

    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await client.del(result.keys);
      }
    } while (cursor !== '0');

  } catch (err) {
    console.error(`Cache pattern DEL error [${pattern}]:`, err.message);
  }
};

// ── getOrSet ───────────────────────────────────────────────────────────────
// The most useful cache utility. Usage:
//
// const monitors = await getOrSet(
//   'monitors:ws-abc123',
//   () => Monitor.find({ workspaceId: 'abc123' }),
//   120 // cache for 2 minutes
// );
//
// Internally:
// 1. Check Redis for the key
// 2. If found (cache hit): return it immediately — no DB query
// 3. If not found (cache miss): run the fetchFn, store result in Redis, return it
export const getOrSet = async (key, fetchFn, ttlSeconds = 300) => {
  const cached = await getCache(key);
  if (cached !== null) {
    return cached;
  }

  const fresh = await fetchFn();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
};

// ── Key builders ───────────────────────────────────────────────────────────
// Centralized key construction prevents typos and makes invalidation easy
// All keys follow: resource:identifier:sub-resource
export const buildCacheKey = (...parts) => parts.join(':');

export const CACHE_KEYS = {
  // A workspace's list of monitors
  monitors:          (workspaceId)           => `monitors:${workspaceId}`,
  // A single monitor's details
  monitor:           (monitorId)             => `monitor:${monitorId}`,
  // A workspace's active incidents
  activeIncidents:   (workspaceId)           => `incidents:active:${workspaceId}`,
  // Hourly uptime stats for a monitor (used in charts)
  uptimeStats:       (monitorId, period)     => `uptime:${monitorId}:${period}`,
  // The public status page (cached aggressively — no auth needed)
  statusPage:        (slug)                  => `statuspage:${slug}`,
  // Workspace overview (summary card numbers on dashboard)
  workspaceOverview: (workspaceId)           => `overview:${workspaceId}`,
};

// How long each type of data should be cached
export const CACHE_TTL = {
  MONITORS:         60,    // 1 minute — balance between freshness and load
  MONITOR:          120,   // 2 minutes — individual monitor details
  INCIDENTS:        30,    // 30 seconds — incidents need to be fresh
  UPTIME_STATS:     300,   // 5 minutes — computed from aggregated data
  STATUS_PAGE:      60,    // 1 minute — public page, cached hard
  WORKSPACE_OVERVIEW: 30,  // 30 seconds — dashboard summary numbers
};