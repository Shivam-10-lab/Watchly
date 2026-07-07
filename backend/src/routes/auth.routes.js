import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updatePreferences,
  registerValidation,
  loginValidation,
  validate,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter }  from '../middleware/rateLimiter.middleware.js';

const router = Router();

// ── Public routes (no token needed) ───────────────────────────────────────
// authLimiter: max 10 failed attempts per 15 min per IP
router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login',    authLimiter, loginValidation,    validate, login);

// Refresh is public — the refresh token cookie IS the credential
// No authLimiter here because it would block legitimate silent refreshes
router.post('/refresh', refresh);

// ── Protected routes ───────────────────────────────────────────────────────
router.post('/logout',     authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me',          authenticate, getMe);
router.patch(
  '/me/preferences',
  authenticate,
  [
    // Inline validation — simple enough not to need a shared validator
    // body validators are imported in the controller file
  ],
  updatePreferences
);

export default router;