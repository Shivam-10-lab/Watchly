import { User }      from '../models/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.utils.js';

// ── registerUser ───────────────────────────────────────────────────────────
export const registerUser = async ({ name, email, password }) => {
  // Check if email is taken
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  // Create user — the pre-save hook in user.model.js hashes the password
  const user = await User.create({ name, email, password });
  return user;
};

// ── loginUser ──────────────────────────────────────────────────────────────
export const loginUser = async ({ email, password }) => {
  // select('+password') because password has select:false in the schema
  // Without this, the password field is simply absent from the document
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
    // NOTE: same error whether email or password is wrong
    // Telling attackers which field is wrong helps them
  }

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token in the user's array
  // Prune tokens older than 7 days to keep the array clean
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  user.refreshTokens = [
    ...user.refreshTokens.filter(t => t.createdAt > sevenDaysAgo),
    { token: refreshToken, createdAt: new Date() },
  ];

  await user.save();

  return { user, accessToken, refreshToken };
};

// ── refreshTokens ──────────────────────────────────────────────────────────
// Refresh token rotation:
// Every use of a refresh token invalidates the old one and issues a new pair.
// If someone uses a token that was already rotated, it means either:
// 1. A replay attack (token was stolen and used before the legitimate user)
// 2. A race condition in the client (two requests tried to refresh at once)
// In both cases, we revoke ALL tokens for this user and force re-login.
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
    ...user.refreshTokens.filter(
      t => t.token !== incomingToken && t.createdAt > sevenDaysAgo
    ),
    { token: newRefreshToken, createdAt: new Date() },
  ];

  await user.save();

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ── logoutUser ─────────────────────────────────────────────────────────────
// Removes only THIS device's refresh token.
// Other devices stay logged in.
export const logoutUser = async (userId, refreshToken) => {
  const user = await User.findById(userId);
  if (!user) return;

  user.refreshTokens = user.refreshTokens.filter(
    t => t.token !== refreshToken
  );
  await user.save();
};

// ── logoutAllDevices ───────────────────────────────────────────────────────
// Wipes all refresh tokens — forces re-login on every device.
// Used when user changes password or suspects compromise.
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
  const user = await User.findByIdAndUpdate(
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