import { Router }         from 'express';
import {
  getSummary,
  getMonitors,
  createMonitor,
  getMonitor,
  updateMonitor,
  deleteMonitor,
  pauseMonitor,
  resumeMonitor,
  uploadRunbook,
  deleteRunbook,
  createMonitorValidation,
  updateMonitorValidation,
  validate,
} from '../controllers/monitor.controller.js';
import { authenticate }        from '../middleware/auth.middleware.js';
import { loadWorkspace }       from '../middleware/workspace.middleware.js';
import { requireRole }         from '../middleware/auth.middleware.js';
import { monitorCreateLimiter }from '../middleware/rateLimiter.middleware.js';
import { flexAuth }            from '../middleware/apiKey.middleware.js';

// Router is mounted at /api/v1/workspaces/:workspaceId/monitors
// Note: mergeParams: true is REQUIRED here.
// Without it, req.params.workspaceId is undefined because this router
// is a child of the workspace router and doesn't inherit parent params.
const router = Router({ mergeParams: true });

// ── Auth: all monitor routes accept JWT OR API key ─────────────────────────
// flexAuth tries X-API-Key header first, then falls back to JWT
router.use(flexAuth);

// ── Workspace: load workspace and verify membership ────────────────────────
router.use(loadWorkspace);

// ── Routes ─────────────────────────────────────────────────────────────────

// Summary must come BEFORE /:monitorId — otherwise Express matches
// the string "summary" as a monitorId and tries to find it in MongoDB
router.get('/summary', getSummary);

router.get(
  '/',
  getMonitors
  // All members (including viewers) can see monitors
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  monitorCreateLimiter,
  createMonitorValidation,
  validate,
  createMonitor
);

router.get(
  '/:monitorId',
  getMonitor
);

router.patch(
  '/:monitorId',
  requireRole('owner', 'admin'),
  updateMonitorValidation,
  validate,
  updateMonitor
);

router.delete(
  '/:monitorId',
  requireRole('owner', 'admin'),
  deleteMonitor
);

// ── Monitor lifecycle ──────────────────────────────────────────────────────
router.post(
  '/:monitorId/pause',
  requireRole('owner', 'admin'),
  pauseMonitor
);

router.post(
  '/:monitorId/resume',
  requireRole('owner', 'admin'),
  resumeMonitor
);

// ── Runbook upload ─────────────────────────────────────────────────────────
// uploadRunbook is an array [multerMiddleware, asyncController]
// Express accepts arrays in route definitions
router.post(
  '/:monitorId/runbook',
  requireRole('owner', 'admin'),
  uploadRunbook
);

router.delete(
  '/:monitorId/runbook',
  requireRole('owner', 'admin'),
  deleteRunbook
);

export default router;