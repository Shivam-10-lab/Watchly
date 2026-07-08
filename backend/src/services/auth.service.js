import { User }      from '../models/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.utils.js';

// ── registerUser ───────────────────────────────────────────────────────────
export const registerUser = async ({ name, email, password }) => {

  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const user = await User.create({ name, email, password });
  return user;
};

// ── loginUser ──────────────────────────────────────────────────────────────
export const loginUser = async ({ email, password }) => {
 
  const user = await User.findOne({ email }).select('+password');

  if (!user || !user.isActive) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

 
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  user.refreshTokens = [...user.refreshTokens.filter(t => t.createdAt > sevenDaysAgo),
    { token: refreshToken, createdAt: new Date() },
  ];

  await user.save();

  return { user, accessToken, refreshToken };
};

// ── refreshTokens ──────────────────────────────────────────────────────────
// Refresh token rotation:

export const refreshTokens = async (incomingToken) => {
  if (!incomingToken) {
    const err = new Error('Refresh token missing');
    err.status = 401;
    throw err;
  }

  // Step 1: Verify the JWT signature and expiry
  let decoded;
  try {
    decoded = verifyRefreshToken(incomingToken);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  // Step 2: Check the token exists in the DB (stateful check)
  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  const tokenEntry = user.refreshTokens.find(
    t => t.token === incomingToken
  );

  if (!tokenEntry) {
    // Token not in DB — it was already used (rotation) or revoked
    // SECURITY RESPONSE: revoke all tokens — potential token theft
    user.refreshTokens = [];
    await user.save();

    const err = new Error(
      'Refresh token already used. All sessions have been revoked for your security. Please log in again.'
    );
    err.status = 401;
    throw err;
  }

  // Step 3: Rotate — remove old token, issue new pair
  const newAccessToken  = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  user.refreshTokens = [
    ...user.refreshTokens.filter(   //Keep every token except the one that was just used.
      t => t.token !== incomingToken && t.createdAt > sevenDaysAgo
    ),
    { token: newRefreshToken, createdAt: new Date() },
  ];

  await user.save();

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ── logoutUser ─────────────────────────────────────────────────────────────

export const logoutUser = async (userId, refreshToken) => {
  const user = await User.findById(userId);
  if (!user) return;

  user.refreshTokens = user.refreshTokens.filter(
    t => t.token !== refreshToken
  );
  await user.save();
};

// ── logoutAllDevices ───────────────────────────────────────────────────────

export const logoutAllDevices = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshTokens: [] });
};

// ── getUserById ────────────────────────────────────────────────────────────
export const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
};

// ── updateAlertPreferences ─────────────────────────────────────────────────
export const updateAlertPreferences = async (userId, preferences) => {
  const user = await User.findByIdAndUpdate(    // 3 arguments: id, update, options
    userId,
    { alertPreferences: preferences },
    { new: true, runValidators: true }
  );
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
};