import * as statsService from '../services/stats.service.js';

const VALID_PERIODS = ['24h', '7d', '30d'];

// ── GET /api/v1/workspaces/:workspaceId/stats ──────────────────────────────
export const getWorkspaceStats = async (req, res, next) => {
  try {
    const period = VALID_PERIODS.includes(req.query.period)
      ? req.query.period
      : '24h';

    const stats = await statsService.getWorkspaceStats(
      req.workspace._id,
      period
    );

    res.status(200).json({
      success: true,
      data:    { stats },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/monitors/:monitorId/stats ─────────
export const getMonitorStats = async (req, res, next) => {
  try {
    const period = VALID_PERIODS.includes(req.query.period)
      ? req.query.period
      : '24h';

    const stats = await statsService.getMonitorStats(
      req.params.monitorId,
      req.workspace._id,
      period
    );

    res.status(200).json({
      success: true,
      data:    { stats },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/monitors/:monitorId/checks ────────
export const getRecentChecks = async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const checks = await statsService.getRecentCheckResults(
      req.params.monitorId,
      req.workspace._id,
      limit
    );

    res.status(200).json({
      success: true,
      data:    { checks },
      count:   checks.length,
    });
  } catch (err) { next(err); }
};