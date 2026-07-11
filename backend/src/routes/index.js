import { Router }   from 'express';
import authRoutes       from './auth.routes.js';
import workspaceRoutes  from './workspace.routes.js';
import monitorRoutes    from './monitor.routes.js';
 import incidentRoutes   from './incident.routes.js';
// import statsRoutes      from './stats.routes.js';
// import statusPageRoutes from './statusPage.routes.js';

const router = Router();

// ── Mount routes ───────────────────────────────────────────────────────────
router.use('/auth',       authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/workspaces/:workspaceId/monitors', monitorRoutes);
router.use('/incidents',  incidentRoutes);
// router.use('/stats',      statsRoutes);
// router.use('/status',     statusPageRoutes);

// ── API info endpoint ──────────────────────────────────────────────────────
// Useful for checking which version of the API is running
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Watchly API v1',
    version: '1.0.0',
    docs:    '/api/v1',
    endpoints: {
      auth:       '/api/v1/auth',
      workspaces: '/api/v1/workspaces',
      monitors:   '/api/v1/workspaces/:workspaceId/monitors',
      incidents:  '/api/v1/incidents',
      stats:      '/api/v1/stats',
      statusPage: '/api/v1/status/:slug',
    },
  });
});

export default router;