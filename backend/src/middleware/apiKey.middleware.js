import { Workspace } from '../models/index.js';
import { Member }    from '../models/index.js';

// ── authenticateApiKey ─────────────────────────────────────────────────────
// Reads X-API-Key header, finds the matching workspace,
// and attaches req.workspace and req.member (with 'admin' role for API keys)
//
// API keys bypass JWT — they're used by CI/CD pipelines, scripts, etc.
// where getting a JWT would require a login flow.

export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key missing. Include X-API-Key header.',
      });
    }

    if (!apiKey.startsWith('wl_')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format. Keys start with wl_',
      });
    }

    const workspace = await Workspace.findOne({ apiKey }).select('+apiKey');

    if (!workspace) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key',
      });
    }

    req.user = { userId: workspace.ownerId.toString() };

    req.member = {
      workspaceId: workspace._id,
      userId:      workspace.ownerId,
      role:        'admin',
    };

    req.workspace   = workspace;
    req.isApiKeyAuth = true;

    next();
  } catch (err) {
    next(err);
  }
};

// ── flexAuth ───────────────────────────────────────────────────────────────

export const flexAuth = async (req, res, next) => {
  const apiKey    = req.headers['x-api-key'];
  const authHeader= req.headers.authorization;

  if (apiKey) {
    return authenticateApiKey(req, res, next);
  }

  if (authHeader?.startsWith('Bearer ')) {
    const { authenticate } = await import('./auth.middleware.js');
    return authenticate(req, res, next);
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Provide Bearer token or X-API-Key header.',
  });
};