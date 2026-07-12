import { Router }                from 'express';
import { getStatusPage }         from '../controllers/statusPage.controller.js';
import { loadWorkspacePublic }   from '../middleware/workspace.middleware.js';

// No auth middleware — this route is intentionally public
const router = Router();

router.get('/:slug', loadWorkspacePublic, getStatusPage);

export default router;