import { Workspace } from '../models/index.js';
import { Member }    from '../models/index.js';

// ── authenticateApiKey ─────────────────────────────────────────────────────
// Reads X-API-Key header, finds the matching workspace,
// and attaches req.workspace and req.member (with 'admin' role for API keys)
//
// API keys bypass JWT — they're used by CI/CD pipelines, scripts, etc.
// where getting a JWT would require a login flow.
//
// Usage:
//   router.post('/monitors',
//     authenticateWithApiKeyOrJwt,  ← try API key first, then JWT
//     loadWorkspace,
//     monitorController.create
//   )
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

    // API keys are stored with select: false in the schema
    // We must explicitly request the field
    const workspace = await Workspace.findOne({ apiKey }).select('+apiKey');

    if (!workspace) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key',
      });
    }

    // For API key auth, we need to set req.user and req.member
    // so downstream middleware (loadWorkspace) and controllers work correctly.
    // We use the workspace owner as the acting user for API key requests.
    req.user = { userId: workspace.ownerId.toString() };

    // Simulate an admin membership so API keys have full write access
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
// Tries API key first, falls back to JWT.
// Apply this on any route that should accept BOTH methods.
//
// How it works:
// If X-API-Key header is present → use API key auth
// If Authorization: Bearer header is present → use JWT auth
// If neither → 401
export const flexAuth = async (req, res, next) => {
  const apiKey    = req.headers['x-api-key'];
  const authHeader= req.headers.authorization;

  if (apiKey) {
    // Delegate to API key middleware
    return authenticateApiKey(req, res, next);
  }

  if (authHeader?.startsWith('Bearer ')) {
    // Delegate to JWT middleware
    const { authenticate } = await import('./auth.middleware.js');
    return authenticate(req, res, next);
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Provide Bearer token or X-API-Key header.',
  });
};