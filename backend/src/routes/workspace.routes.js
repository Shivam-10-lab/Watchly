import { Router } from 'express';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspace,
  updateWorkspace,
  getApiKey,
  rotateApiKey,
  getMembers,
  inviteMember,
  removeMember,
  updateMemberRole,
  createWorkspaceValidation,
  inviteMemberValidation,
  updateRoleValidation,
} from '../controllers/workspace.controller.js';
import { authenticate }   from '../middleware/auth.middleware.js';
import { loadWorkspace }  from '../middleware/workspace.middleware.js';
import { requireRole }    from '../middleware/auth.middleware.js';
import { validate }       from '../middleware/validate.middleware.js';

const router = Router();

// All workspace routes require a logged-in user
router.use(authenticate);

// ── Workspace CRUD ─────────────────────────────────────────────────────────
router.post(
  '/',
  createWorkspaceValidation,
  validate,
  createWorkspace
);

router.get('/', getMyWorkspaces);

// All routes below require the user to be a member of :workspaceId
// loadWorkspace does the membership check and attaches req.workspace + req.member
router.get(
  '/:workspaceId',
  loadWorkspace,
  getWorkspace
);

router.patch(
  '/:workspaceId',
  loadWorkspace,
  requireRole('owner', 'admin'),
  updateWorkspace
);

// ── API Key management ─────────────────────────────────────────────────────
// Only owners and admins can see/rotate the API key
router.get(
  '/:workspaceId/api-key',
  loadWorkspace,
  requireRole('owner', 'admin'),
  getApiKey
);

router.post(
  '/:workspaceId/api-key/rotate',
  loadWorkspace,
  requireRole('owner'),      // Only the owner can rotate — it's a destructive action
  rotateApiKey
);

// ── Member management ──────────────────────────────────────────────────────
router.get(
  '/:workspaceId/members',
  loadWorkspace,
  getMembers                 // all members can see the team list
);

router.post(
  '/:workspaceId/members',
  loadWorkspace,
  requireRole('owner', 'admin'),
  inviteMemberValidation,
  validate,
  inviteMember
);

router.delete(
  '/:workspaceId/members/:memberId',
  loadWorkspace,
  requireRole('owner', 'admin'),
  removeMember
);

router.patch(
  '/:workspaceId/members/:memberId/role',
  loadWorkspace,
  requireRole('owner'),      // Only owners can change roles
  updateRoleValidation,
  validate,
  updateMemberRole
);

export default router;