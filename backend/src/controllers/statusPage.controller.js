import {
  Monitor,
  Incident,
  UptimeStat,
} from '../models/index.js';
import {
  getOrSet,
  CACHE_KEYS,
} from '../utils/cache.utils.js';

// ── GET /api/v1/status/:slug ───────────────────────────────────────────────
// Public endpoint — anyone with the slug can view.
// req.workspace is loaded by loadWorkspacePublic middleware.
// Cached for 60 seconds — high traffic, rarely changes.
export const getStatusPage = async (req, res, next) => {
  try {
    const { workspace } = req;

    const data = await getOrSet(
      CACHE_KEYS.statusPage(workspace.slug),
      async () => {
        // Get all non-paused monitors for this workspace
        const monitors = await Monitor.find({
          workspaceId: workspace._id,
          isPaused:    false,
        })
          .select('name url status lastCheckedAt lastResponseTimeMs type')
          .sort({ createdAt: 1 })
          .lean();

        // Get active incidents
        const activeIncidents = await Incident.find({
          workspaceId: workspace._id,
          status:      'ongoing',
        })
          .populate('monitorId', 'name')
          .sort({ startedAt: -1 })
          .lean();

        // Get 90-day uptime for each monitor
        const ninetyDaysAgo = new Date(
          Date.now() - 90 * 24 * 60 * 60 * 1000
        );

        const uptimeData = await UptimeStat.aggregate([
          {
            $match: {
              workspaceId: workspace._id,
              hour:        { $gte: ninetyDaysAgo },
            },
          },
          {
            $group: {
              _id:        '$monitorId',
              avgUptime:  { $avg: '$uptimePercent' },
              totalChecks:{ $sum: '$totalChecks' },
              upChecks:   { $sum: '$upChecks' },
            },
          },
        ]);

        const uptimeByMonitor = {};
        uptimeData.forEach(u => {
          uptimeByMonitor[u._id.toString()] = {
            uptimePercent: u.totalChecks > 0
              ? Math.round((u.upChecks / u.totalChecks) * 10000) / 100
              : 100,
          };
        });

        // Determine overall system status
        const hasOutage    = monitors.some(m => m.status === 'DOWN');
        const hasDegraded  = monitors.some(m => m.status === 'DEGRADED');
        let overallStatus  = 'operational';
        if (hasOutage)   overallStatus = 'outage';
        else if (hasDegraded) overallStatus = 'degraded';

        return {
          workspace: {
            name:               workspace.name,
            slug:               workspace.slug,
            statusPageMessage:  workspace.statusPageMessage,
          },
          overallStatus,
          monitors: monitors.map(m => ({
            _id:              m._id,
            name:             m.name,
            url:              m.url,
            status:           m.status,
            lastCheckedAt:    m.lastCheckedAt,
            lastResponseTimeMs: m.lastResponseTimeMs,
            uptimePercent90d: uptimeByMonitor[m._id.toString()]?.uptimePercent ?? null,
          })),
          activeIncidents: activeIncidents.map(i => ({
            _id:         i._id,
            monitorName: i.monitorId?.name,
            startedAt:   i.startedAt,
            acknowledged:i.acknowledged,
          })),
          generatedAt: new Date().toISOString(),
        };
      },
      60 // cache for 60 seconds
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) { next(err); }
};