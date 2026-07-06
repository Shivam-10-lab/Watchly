import { validationResult } from 'express-validator';

// ── validate ───────────────────────────────────────────────────────────────
// Drop this middleware AFTER your express-validator chain in any route.
// It checks if any validation rules failed and sends a structured error response.
//
// Usage in routes:
//   router.post('/monitors',
//     authenticate,
//     loadWorkspace,
//     [
//       body('name').notEmpty().withMessage('Name is required'),
//       body('url').isURL().withMessage('Valid URL required'),
//     ],
//     validate,         ← this file's export
//     monitorController.create
//   )
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors:  errors.array().map(err => ({
        field:   err.path,
        message: err.msg,
        value:   err.value,
      })),
    });
  }

  next();
};

// ── Common validation chains ───────────────────────────────────────────────
// Export reusable validator arrays so you don't repeat them in every controller
import { body, param } from 'express-validator';

// Validates a MongoDB ObjectId in route params
export const validateMongoId = (paramName = 'id') => [
  param(paramName)
    .isMongoId()
    .withMessage(`${paramName} must be a valid ID`),
];

// Shared URL validator used by monitor creation and updates
export const validateUrl = () =>
  body('url')
    .trim()
    .notEmpty().withMessage('URL is required')
    .isURL({ require_protocol: true })
    .withMessage('Must be a valid URL including http:// or https://')
    .custom((val) => {
      // Reject localhost and private IPs at validation stage
      // (SSRF check in the webhook consumer catches runtime cases)
      const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      try {
        const { hostname } = new URL(val);
        if (blocked.includes(hostname)) {
          throw new Error('localhost URLs are not allowed for monitors');
        }
      } catch (e) {
        if (e.message.includes('not allowed')) throw e;
      }
      return true;
    });

// Monitor creation validators
export const createMonitorValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Monitor name is required')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer'),

  validateUrl(),

  body('intervalSeconds')
    .optional()
    .isInt()
    .isIn([30, 60, 120, 300, 600, 1800])
    .withMessage('Interval must be 30, 60, 120, 300, 600, or 1800 seconds'),

  body('type')
    .optional()
    .isIn(['http', 'keyword', 'ssl'])
    .withMessage('Type must be http, keyword, or ssl'),

  body('method')
    .optional()
    .isIn(['GET', 'POST', 'HEAD'])
    .withMessage('Method must be GET, POST, or HEAD'),

  body('expectedStatusCode')
    .optional()
    .isInt({ min: 100, max: 599 })
    .withMessage('Expected status code must be between 100 and 599'),

  body('keywordToFind')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Keyword must be 200 characters or fewer'),

  body('degradedThresholdMs')
    .optional()
    .isInt({ min: 100, max: 30000 })
    .withMessage('Degraded threshold must be between 100ms and 30000ms'),

  body('notifications.webhook.url')
    .optional()
    .isURL({ require_protocol: true })
    .withMessage('Webhook URL must be a valid URL'),
];

// Auth validators
export const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/\d/).withMessage('Password must contain at least one number'),
];

export const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

// Workspace creation validators
export const createWorkspaceValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Workspace name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
];