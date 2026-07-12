import { Router }          from 'express';
import {
  getWorkspaceStats,
  getMonitorStats,
  getRecentChecks,
} from '../controllers/stats.controller.js';
import { authenticate }    from '../middleware/auth.middleware.js';
import { loadWorkspace }   from '../middleware/workspace.middleware.js';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(loadWorkspace);

// Workspace-level stats
router.get('/', getWorkspaceStats);

// Monitor-level stats and check history
// These are nested under the monitor ID in the URL
router.get('/monitors/:monitorId/stats',  getMonitorStats);
router.get('/monitors/:monitorId/checks', getRecentChecks);

export default router;