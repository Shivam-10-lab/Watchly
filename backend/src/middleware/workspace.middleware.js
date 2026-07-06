import { Workspace } from '../models/index.js';
import { Member }    from '../models/index.js';

// ── loadWorkspace ──────────────────────────────────────────────────────────
// Applied on all routes under /api/v1/workspaces/:workspaceId/*
//
// After this runs, controllers can safely use:
//   req.workspace → the full Workspace document
//   req.member    → the Member document (role: 'owner' | 'admin' | 'viewer')
//
// If the user is not a member → 403 (not 404, so we don't leak workspace existence)
export const loadWorkspace = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        message: 'workspaceId is required in the URL',
      });
    }

    // Load the workspace
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
    }

    // Check the requesting user is a member
    // req.user is set by authenticate middleware (must run before this)
    const member = await Member.findOne({
      workspaceId: workspace._id,
      userId:      req.user.userId,
    });

    if (!member) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this workspace',
      });
    }

    // Attach to req so controllers don't need to re-query
    req.workspace = workspace;
    req.member    = member;

    next();
  } catch (err) {
    next(err);
  }
};

// ── loadWorkspacePublic ────────────────────────────────────────────────────
// For the public status page — loads a workspace by slug, no auth required
// Only loads workspaces that have statusPageEnabled: true
export const loadWorkspacePublic = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const workspace = await Workspace.findOne({
      slug,
      statusPageEnabled: true,
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: 'Status page not found or has been disabled',
      });
    }

    req.workspace = workspace;
    next();
  } catch (err) {
    next(err);
  }
};