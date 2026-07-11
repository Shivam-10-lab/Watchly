import { Router }           from 'express';
import {
  getIncidents,
  getActiveIncidents,
  getIncidentById,
  acknowledgeIncident,
  updatePostmortem,
  updatePostmortemValidation,
} from '../controllers/incident.controller.js';
import { authenticate }   from '../middleware/auth.middleware.js';
import { loadWorkspace }  from '../middleware/workspace.middleware.js';
import { requireRole }    from '../middleware/auth.middleware.js';
import { validate }       from '../middleware/validate.middleware.js';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(loadWorkspace);

// active BEFORE /:incidentId — string "active" matches :incidentId otherwise
router.get('/active', getActiveIncidents);
router.get('/',       getIncidents);
router.get('/:incidentId', getIncidentById);

router.post(
  '/:incidentId/acknowledge',
  requireRole('owner', 'admin'),
  acknowledgeIncident
);

router.patch(
  '/:incidentId/postmortem',
  requireRole('owner', 'admin'),
  updatePostmortemValidation,
  validate,
  updatePostmortem
);

export default router;