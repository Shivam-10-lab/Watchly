import * as incidentService from '../services/incident.service.js';
import { body, query }      from 'express-validator';
import { validate }         from '../middleware/validate.middleware.js';

// ── GET /api/v1/workspaces/:workspaceId/incidents ─────────────────────────
export const getIncidents = async (req, res, next) => {
  try {
    const {
      monitorId,
      status,
      cursor,
      limit,
    } = req.query;

    const result = await incidentService.getIncidents({
      workspaceId: req.workspace._id,
      monitorId:   monitorId || null,
      status:      status    || null,
      cursor:      cursor    || null,
      limit:       parseInt(limit) || 20,
    });

    res.status(200).json({
      success: true,
      data: {
        incidents:   result.items,
        nextCursor:  result.nextCursor,
        hasNextPage: result.hasNextPage,
      },
      count: result.items.length,
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/incidents/active ──────────────────
// Must be BEFORE /:incidentId route
export const getActiveIncidents = async (req, res, next) => {
  try {
    const incidents = await incidentService.getActiveIncidents(
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      data:    { incidents },
      count:   incidents.length,
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/workspaces/:workspaceId/incidents/:incidentId ─────────────
export const getIncidentById = async (req, res, next) => {
  try {
    const incident = await incidentService.getIncidentById(
      req.params.incidentId,
      req.workspace._id
    );

    res.status(200).json({
      success: true,
      data:    { incident },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/workspaces/:workspaceId/incidents/:incidentId/acknowledge ─
export const acknowledgeIncident = async (req, res, next) => {
  try {
    const incident = await incidentService.acknowledgeIncident({
      incidentId:  req.params.incidentId,
      workspaceId: req.workspace._id,
      userId:      req.user.userId,
    });

    res.status(200).json({
      success: true,
      message: 'Incident acknowledged',
      data:    { incident },
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/workspaces/:workspaceId/incidents/:incidentId/postmortem ─
export const updatePostmortem = async (req, res, next) => {
  try {
    const incident = await incidentService.updatePostmortem({
      incidentId:  req.params.incidentId,
      workspaceId: req.workspace._id,
      postmortem:  req.body.postmortem,
    });

    res.status(200).json({
      success: true,
      message: 'Postmortem updated',
      data:    { incident },
    });
  } catch (err) { next(err); }
};

export const updatePostmortemValidation = [
  body('postmortem')
    .notEmpty().withMessage('Postmortem text is required')
    .isLength({ max: 5000 }).withMessage('Postmortem must be 5000 chars or fewer'),
];