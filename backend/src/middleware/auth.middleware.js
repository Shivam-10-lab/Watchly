import { verifyAccessToken } from '../utils/jwt.utils.js';

// ── authenticate ───────────────────────────────────────────────────────────

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