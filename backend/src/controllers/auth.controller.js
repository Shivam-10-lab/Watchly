import * as authService from '../services/auth.service.js';
import {
  refreshTokenCookieOptions,
  clearTokenCookieOptions,
} from '../utils/jwt.utils.js';
import {
  registerValidation,
  loginValidation,
  validate,
} from '../middleware/validate.middleware.js';

// ── POST /api/v1/auth/register ─────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const user = await authService.registerUser({ name, email, password });

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please sign in.',
      data:    { user: user.toPublicJSON() },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/login ────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } =
      await authService.loginUser({ email, password });

    // Refresh token → httpOnly cookie (not readable by JS)
    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);

    // Access token → response body
    // Frontend stores it in memory (React state / a module-level variable)
    // NOT in localStorage (vulnerable to XSS)
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user:       user.toPublicJSON(),
        accessToken,
        expiresIn:  15 * 60, // 15 minutes in seconds
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/refresh ──────────────────────────────────────────────
// Called silently by the frontend when an API request returns 401 TOKEN_EXPIRED
// The browser automatically includes the refreshToken cookie
export const refresh = async (req, res, next) => {
  try {
    const incomingToken = req.cookies?.refreshToken;

    const { user, accessToken, refreshToken: newRefreshToken } =
      await authService.refreshTokens(incomingToken);

    // Rotate: set the new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, refreshTokenCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken,
        expiresIn: 15 * 60,
        user:      user.toPublicJSON(),
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/logout ───────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    await authService.logoutUser(req.user.userId, refreshToken);

    res.clearCookie('refreshToken', clearTokenCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) { next(err); }
};

// ── POST /api/v1/auth/logout-all ──────────────────────────────────────────
export const logoutAll = async (req, res, next) => {
  try {
    await authService.logoutAllDevices(req.user.userId);
    res.clearCookie('refreshToken', clearTokenCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices',
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/auth/me ────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.userId);

    res.status(200).json({
      success: true,
      data:    { user: user.toPublicJSON() },
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/auth/me/preferences ─────────────────────────────────────
export const updatePreferences = async (req, res, next) => {
  try {
    const { emailAlerts, recoveryAlerts } = req.body;
    const user = await authService.updateAlertPreferences(req.user.userId, {
      emailAlerts:    emailAlerts    ?? true,
      recoveryAlerts: recoveryAlerts ?? true,
    });

    res.status(200).json({
      success: true,
      message: 'Preferences updated',
      data:    { user: user.toPublicJSON() },
    });
  } catch (err) { next(err); }
};

// Re-export validators so routes file can import them from one place
export { registerValidation, loginValidation, validate };