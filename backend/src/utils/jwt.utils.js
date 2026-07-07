import jwt from 'jsonwebtoken';

// ── Token generation ───────────────────────────────────────────────────────
// Access token: short-lived (15 min), stateless

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email:  user.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
};

// Refresh token: long-lived (7 days), stateful

export const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
};

// ── Token verification ─────────────────────────────────────────────────────

export const verifyAccessToken  = (token) =>
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

// ── Cookie options ─────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

// Refresh token goes in an httpOnly cookie:

export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path:     '/',  // Only send this cookie when the requested URL starts with this path
};

export const clearTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   0,
  path:     '/',
};