import * as workspaceService from '../services/workspace.service.js';
import { body }              from 'express-validator';
import { validate }          from '../middleware/validate.middleware.js';

// ── POST /api/v1/workspaces ────────────────────────────────────────────────
export const createWorkspace = async (req, res, next) => {
  try {
    const { name } = req.body;
    const workspace = await workspaceService.createWorkspace({
      name,
      userId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      message: 'Workspace created',
      data:    { workspace },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces ─────────────────────────────────────────────────
export const getMyWorkspaces = async (req, res, next) => {
  try {
    const workspaces = await workspaceService.getMyWorkspaces(req.user.userId);

    res.status(200).json({
      success: true,
      data:    { workspaces },
      count:   workspaces.length,
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId ────────────────────────────────────
// req.workspace is already loaded by loadWorkspace middleware
export const getWorkspace = (req, res) => {
  res.status(200).json({
    success: true,
    data:    {
      workspace: req.workspace,
      role:      req.member.role,
    },
  });
};

// ── PATCH /api/v1/workspaces/:workspaceId ──────────────────────────────────
export const updateWorkspace = async (req, res, next) => {
  try {
    const workspace = await workspaceService.updateWorkspace(
      req.workspace._id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Workspace updated',
      data:    { workspace },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/api-key ────────────────────────────
export const getApiKey = async (req, res, next) => {
  try {
    const result = await workspaceService.getWorkspaceApiKey(req.workspace._id);

    res.status(200).json({
      success: true,
      data:    result,
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/api-key/rotate ───────────────────
export const rotateApiKey = async (req, res, next) => {
  try {
    const result = await workspaceService.rotateApiKey(req.workspace._id);

    res.status(200).json({
      success: true,
      message: 'API key rotated. Update any integrations using the old key.',
      data:    result,
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/members ────────────────────────────
export const getMembers = async (req, res, next) => {
  try {
    const members = await workspaceService.getMembers(req.workspace._id);

    res.status(200).json({
      success: true,
      data:    { members },
      count:   members.length,
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/members ───────────────────────────
export const inviteMember = async (req, res, next) => {
  try {
    const { email, role = 'viewer' } = req.body;

    const result = await workspaceService.inviteMember({
      workspaceId:  req.workspace._id,
      email,
      role,
      inviterRole:  req.member.role,
    });

    res.status(201).json({
      success: true,
      message: `${result.user.name} has been added to the workspace`,
      data:    result,
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/workspaces/:workspaceId/members/:memberId ──────────────
export const removeMember = async (req, res, next) => {
  try {
    await workspaceService.removeMember({
      workspaceId:    req.workspace._id,
      memberUserId:   req.params.memberId,
      requesterRole:  req.member.role,
      requesterId:    req.user.userId,
    });

    res.status(200).json({
      success: true,
      message: 'Member removed from workspace',
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/workspaces/:workspaceId/members/:memberId/role ──────────
export const updateMemberRole = async (req, res, next) => {
  try {
    const { role } = req.body;

    const member = await workspaceService.updateMemberRole({
      workspaceId:    req.workspace._id,
      memberUserId:   req.params.memberId,
      newRole:        role,
      requesterRole:  req.member.role,
    });

    res.status(200).json({
      success: true,
      message: 'Member role updated',
      data:    { member },
    });
  } catch (err) { next(err); }
};

// ── Validation chains ──────────────────────────────────────────────────────
export const createWorkspaceValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Workspace name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
];

export const inviteMemberValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['admin', 'viewer'])
    .withMessage('Role must be admin or viewer'),
];

export const updateRoleValidation = [
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['admin', 'viewer'])
    .withMessage('Role must be admin or viewer'),
];