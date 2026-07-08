import * as monitorService from '../services/monitor.service.js';
import { runbookUpload }   from '../services/monitor.service.js';
import {
  createMonitorValidation,
  validate,
  validateMongoId,
} from '../middleware/validate.middleware.js';
import { body } from 'express-validator';

// ── GET /api/v1/workspaces/:workspaceId/monitors/summary ──────────────────
// Dashboard overview — must be before /:monitorId so Express
// doesn't try to match "summary" as a Mongo ID
export const getSummary = async (req, res, next) => {
  try {
    const summary = await monitorService.getMonitorSummary(
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      data:    { summary },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/monitors ──────────────────────────
export const getMonitors = async (req, res, next) => {
  try {
    const monitors = await monitorService.getMonitors(req.workspace._id);

    res.status(200).json({
      success: true,
      data:    { monitors },
      count:   monitors.length,
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/monitors ─────────────────────────
export const createMonitor = async (req, res, next) => {
  try {
    const monitor = await monitorService.createMonitor({
      workspaceId: req.workspace._id,
      data:        req.body,
    });

    res.status(201).json({
      success: true,
      message: `Monitor created. First check will run shortly.`,
      data:    { monitor },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/monitors/:monitorId ───────────────
export const getMonitor = async (req, res, next) => {
  try {
    const monitor = await monitorService.getMonitorById(
      req.params.monitorId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      data:    { monitor },
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/workspaces/:workspaceId/monitors/:monitorId ────────────
export const updateMonitor = async (req, res, next) => {
  try {
    const monitor = await monitorService.updateMonitor(
      req.params.monitorId,
      req.workspace._id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Monitor updated',
      data:    { monitor },
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/workspaces/:workspaceId/monitors/:monitorId ───────────
export const deleteMonitor = async (req, res, next) => {
  try {
    const result = await monitorService.deleteMonitor(
      req.params.monitorId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      message: 'Monitor deleted and health checks stopped',
      data:    result,
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/monitors/:monitorId/pause ────────
export const pauseMonitor = async (req, res, next) => {
  try {
    const monitor = await monitorService.pauseMonitor(
      req.params.monitorId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      message: 'Monitor paused. Health checks stopped.',
      data:    { monitor },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/monitors/:monitorId/resume ───────
export const resumeMonitor = async (req, res, next) => {
  try {
    const monitor = await monitorService.resumeMonitor(
      req.params.monitorId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      message: 'Monitor resumed. Health checks restarted.',
      data:    { monitor },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/monitors/:monitorId/runbook ──────
// Multer middleware runs BEFORE the controller function
// It parses the multipart/form-data and puts the file on req.file
export const uploadRunbook = [
  runbookUpload.single('file'),
  async (req, res, next) => {
    try {
      const result = await monitorService.uploadRunbook(
        req.params.monitorId,
        req.workspace._id,
        req.file
      );

      res.status(200).json({
        success: true,
        message: 'Runbook uploaded successfully',
        data:    result,
      });
    } catch (err) { next(err); }
  },
];

// ── DELETE /api/v1/workspaces/:workspaceId/monitors/:monitorId/runbook ────
export const deleteRunbook = async (req, res, next) => {
  try {
    await monitorService.deleteRunbook(
      req.params.monitorId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      message: 'Runbook deleted',
    });
  } catch (err) { next(err); }
};

// ── Validation chains ──────────────────────────────────────────────────────
export const updateMonitorValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer'),

  body('intervalSeconds')
    .optional()
    .isInt()
    .isIn([30, 60, 120, 300, 600, 1800])
    .withMessage('Interval must be 30, 60, 120, 300, 600, or 1800 seconds'),

  body('degradedThresholdMs')
    .optional()
    .isInt({ min: 100, max: 30000 })
    .withMessage('Threshold must be 100–30000ms'),

  body('notifications.webhook.url')
    .optional()
    .isURL({ require_protocol: true })
    .withMessage('Webhook must be a valid URL'),
];

// Re-export for use in routes
export { createMonitorValidation, validate };