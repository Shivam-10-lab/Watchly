import mongoose from 'mongoose';
import {
  CheckResult,
  UptimeStat,
  Incident,
  Monitor,
} from '../models/index.js';
import {
  getOrSet,
  deleteCache,
  CACHE_KEYS,
  CACHE_TTL,
} from '../utils/cache.utils.js';

// ── getMonitorStats ────────────────────────────────────────────────────────
// Returns uptime percentage, response time stats, and chart data
// for a specific monitor over a given time period.
// Reads from pre-aggregated UptimeStat collection (fast)
// with a fallback to live CheckResult aggregation (slow but accurate)
// for periods where the cron hasn't run yet.
export const getMonitorStats = async (monitorId, workspaceId, period = '24h') => {
  const cacheKey = CACHE_KEYS.uptimeStats(monitorId, period);

  return getOrSet(
    cacheKey,
    async () => {
      const { startDate, hours } = getPeriodRange(period);

      // ── Read pre-aggregated hourly stats ─────────────────────────────────
      const hourlyStats = await UptimeStat.find({
        monitorId: new mongoose.Types.ObjectId(monitorId),
        hour: { $gte: startDate },
      })
        .sort({ hour: 1 })
        .lean();

      // ── Also get recent live check results ────────────────────────────────
     
      const twoHoursAgo   = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const recentChecks  = await CheckResult.find({
        monitorId: new mongoose.Types.ObjectId(monitorId),
        checkedAt: { $gte: twoHoursAgo },
      })
        .sort({ checkedAt: -1 })
        .limit(200)
        .lean();

      // ── Compute overall stats from hourly data ───────────────────────────
      const overallStats = computeOverallStats(hourlyStats, recentChecks);

      // ── Build chart data ─────────────────────────────────────────────────
      // Uptime bar chart: one data point per hour
      const uptimeChart = buildUptimeChart(hourlyStats, hours, startDate);

      // Response time sparkline: last 50 check results
      const responseTimeChart = recentChecks
        .slice(0, 50)
        .reverse()
        .map(c => ({
          time:          c.checkedAt,
          responseTimeMs: c.responseTimeMs,
          status:         c.status,
        }));

      // ── Incident count for the period ────────────────────────────────────
      const incidentCount = await Incident.countDocuments({
        monitorId: new mongoose.Types.ObjectId(monitorId),
        startedAt: { $gte: startDate },
      });

      return {
        period,
        ...overallStats,
        incidentCount,
        charts: {
          uptime:       uptimeChart,
          responseTime: responseTimeChart,
        },
      };
    },
    CACHE_TTL.UPTIME_STATS
  );
};

// ── getWorkspaceStats ──────────────────────────────────────────────────────
// Aggregate stats across all monitors in a workspace
export const getWorkspaceStats = async (workspaceId, period = '24h') => {
  const { startDate } = getPeriodRange(period);

  const monitors = await Monitor.find({ workspaceId }).lean();

  if (monitors.length === 0) {
    return {
      period,
      avgUptimePercent:  100,
      totalIncidents:    0,
      avgResponseMs:     null,
      monitorsWithIssues:[],
    };
  }

  const monitorIds = monitors.map(m => m._id);

  // Get aggregated uptime per monitor
  const stats = await UptimeStat.aggregate([
    {
      $match: {
        monitorId: { $in: monitorIds },
        hour:      { $gte: startDate },
      },
    },
    {
      $group: {
        _id:             '$monitorId',
        avgUptime:       { $avg: '$uptimePercent' },
        avgResponseMs:   { $avg: '$avgResponseMs' },
        totalChecks:     { $sum: '$totalChecks' },
        downChecks:      { $sum: '$downChecks' },
      },
    },
  ]);

  // Get total incidents in the period
  const totalIncidents = await Incident.countDocuments({
    workspaceId,
    startedAt: { $gte: startDate },
  });

  // Find monitors with the worst uptime
  const monitorsWithIssues = stats
    .filter(s => s.avgUptime < 99)
    .sort((a, b) => a.avgUptime - b.avgUptime)
    .slice(0, 5)
    .map(s => {
      const monitor = monitors.find(
        m => m._id.toString() === s._id.toString()
      );
      return {
        monitorId:   s._id,
        monitorName: monitor?.name || 'Unknown',
        uptimePercent: Math.round(s.avgUptime * 100) / 100,
        avgResponseMs: s.avgResponseMs,
      };
    });

  const overallAvgUptime = stats.length > 0
    ? stats.reduce((sum, s) => sum + s.avgUptime, 0) / stats.length
    : 100;

  const overallAvgResponse = stats.length > 0
    ? stats.reduce((sum, s) => sum + (s.avgResponseMs || 0), 0) / stats.length
    : null;

  return {
    period,
    avgUptimePercent:   Math.round(overallAvgUptime * 100) / 100,
    totalIncidents,
    avgResponseMs:      overallAvgResponse ? Math.round(overallAvgResponse) : null,
    monitorsWithIssues,
  };
};

// ── getRecentCheckResults ──────────────────────────────────────────────────
// Last N check results for a monitor — used for the check history table
export const getRecentCheckResults = async (monitorId, workspaceId, limit = 50) => {
  return CheckResult.find({
    monitorId: new mongoose.Types.ObjectId(monitorId),
  })
    .sort({ checkedAt: -1 })
    .limit(Math.min(limit, 200))
    .lean();
};

// ── Helper functions ───────────────────────────────────────────────────────

const getPeriodRange = (period) => {
  const now = new Date();
  switch (period) {
    case '24h':
      return { startDate: new Date(now - 24 * 60 * 60 * 1000), hours: 24 };
    case '7d':
      return { startDate: new Date(now - 7 * 24 * 60 * 60 * 1000), hours: 168 };
    case '30d':
      return { startDate: new Date(now - 30 * 24 * 60 * 60 * 1000), hours: 720 };
    default:
      return { startDate: new Date(now - 24 * 60 * 60 * 1000), hours: 24 };
  }
};

const computeOverallStats = (hourlyStats, recentChecks) => {
  if (hourlyStats.length === 0 && recentChecks.length === 0) {
    return {
      uptimePercent: null,
      avgResponseMs: null,
      p95ResponseMs: null,
      totalChecks:   0,
    };
  }

  if (hourlyStats.length > 0) {
    const totalChecks = hourlyStats.reduce((s, h) => s + h.totalChecks, 0);
    const upChecks    = hourlyStats.reduce((s, h) => s + h.upChecks, 0);
    const avgResponse = hourlyStats.reduce(
      (s, h) => s + (h.avgResponseMs || 0), 0
    ) / hourlyStats.length;
    const p95 = Math.max(...hourlyStats.map(h => h.p95ResponseMs || 0));

    return {
      uptimePercent: totalChecks > 0
        ? Math.round((upChecks / totalChecks) * 10000) / 100
        : 100,
      avgResponseMs: Math.round(avgResponse),
      p95ResponseMs: p95 || null,
      totalChecks,
    };
  }

  // Fallback to live check results
  const validChecks  = recentChecks.filter(c => c.responseTimeMs !== null);
  const upChecks     = recentChecks.filter(c => c.status === 'UP').length;
  const sortedTimes  = validChecks.map(c => c.responseTimeMs).sort((a, b) => a - b);
  const avgResponse  = sortedTimes.length > 0
    ? sortedTimes.reduce((s, t) => s + t, 0) / sortedTimes.length
    : null;
  const p95Index     = Math.ceil(0.95 * sortedTimes.length) - 1;

  return {
    uptimePercent: recentChecks.length > 0
      ? Math.round((upChecks / recentChecks.length) * 10000) / 100
      : null,
    avgResponseMs: avgResponse ? Math.round(avgResponse) : null,
    p95ResponseMs: sortedTimes.length > 0 ? sortedTimes[Math.max(0, p95Index)] : null,
    totalChecks:   recentChecks.length,
  };
};

const buildUptimeChart = (hourlyStats, totalHours, startDate) => {
  // Build a map of hour → uptime percentage
  const statsByHour = {};
  hourlyStats.forEach(stat => {
    const hourKey = new Date(stat.hour).toISOString();
    statsByHour[hourKey] = stat.uptimePercent;
  });

  // Generate a data point for every hour in the range
  const chart = [];
  for (let i = 0; i < totalHours; i++) {
    const hour    = new Date(startDate.getTime() + i * 60 * 60 * 1000);
    const hourKey = hour.toISOString();
    chart.push({
      hour,
      uptimePercent: statsByHour[hourKey] ?? null,
      // null = no data for this hour (monitor didn't exist, was paused, etc.)
    });
  }

  return chart;
};