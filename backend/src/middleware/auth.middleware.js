import { verifyAccessToken } from '../utils/jwt.utils.js';

// ── authenticate ───────────────────────────────────────────────────────────
// Protects any route it's applied to.
// Reads the Bearer token from the Authorization header,
// verifies it, and attaches req.user so controllers know who's calling.
//
// Usage in routes:
//   router.get('/monitors', authenticate, monitorController.getAll)
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token missing. Please log in.',
        code:    'NO_TOKEN',
      });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Attach decoded payload to req
    // decoded contains: { userId, email, iat, exp }
    req.user = decoded;
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired. Please refresh.',
        code:    'TOKEN_EXPIRED',
        // The frontend's axios interceptor watches for 'TOKEN_EXPIRED'
        // and silently calls /auth/refresh before retrying the request
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid access token.',
      code:    'INVALID_TOKEN',
    });
  }
};

// ── requireRole ────────────────────────────────────────────────────────────
// Used AFTER both authenticate AND workspace middleware have run.
// By that point, req.member is available (set by workspace middleware).
//
// Usage:
//   router.delete('/monitors/:id',
//     authenticate,
//     loadWorkspace,
//     requireRole('admin', 'owner'),
//     monitorController.delete
//   )
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.member) {
      return res.status(403).json({
        success: false,
        message: 'Workspace membership required',
      });
    }

    if (!roles.includes(req.member.role)) {
      return res.status(403).json({
        success: false,
        message: `This action requires one of these roles: ${roles.join(', ')}. Your role: ${req.member.role}`,
      });
    }

    next();
  };
};