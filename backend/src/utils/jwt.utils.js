import jwt from 'jsonwebtoken';

// ── Token generation ───────────────────────────────────────────────────────
// Access token: short-lived (15 min), stateless
// The server verifies it purely by checking the signature — no DB lookup needed
// This makes every authenticated request fast
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
// Must exist in the user's refreshTokens array in MongoDB to be valid
// This is what allows us to revoke sessions (logout, compromised account)
export const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
};

// ── Token verification ─────────────────────────────────────────────────────
// These throw if the token is invalid or expired
// The auth middleware catches those throws
export const verifyAccessToken  = (token) =>
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

// ── Cookie options ─────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

// Refresh token goes in an httpOnly cookie:
// - httpOnly: JS cannot read it (XSS protection)
// - secure:   only sent over HTTPS in production
// - sameSite: 'none' in production because frontend (Vercel) and backend
//             (Render) are on different domains
// - 'lax' in development because both are on localhost
export const refreshTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path:     '/',
};

export const clearTokenCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   0,
  path:     '/',
};