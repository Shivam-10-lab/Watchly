import mongoose             from 'mongoose';
import { Workspace, Member, Monitor } from '../models/index.js';
import {
  deleteCache,
  deleteCacheByPattern,
  CACHE_KEYS,
} from '../utils/cache.utils.js';

// ── createWorkspace ────────────────────────────────────────────────────────
// Creates the workspace AND the owner membership in one transaction.

export const createWorkspace = async ({ name, userId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
  
    const slug = await Workspace.generateSlug(name);

    // Create the workspace
    const [workspace] = await Workspace.create(
      [{ name, slug, ownerId: userId }],
      { session }
    );

    // Create the owner membership
    await Member.create(
      [{
        workspaceId: workspace._id,
        userId,
        role: 'owner',
      }],
      { session }
    );

    await session.commitTransaction();
    return workspace;

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ── getMyWorkspaces ────────────────────────────────────────────────────────
// Returns all workspaces the user is a member of,
// with their role in each workspace and monitor count.
export const getMyWorkspaces = async (userId) => {
  // Find all memberships for this user
  const memberships = await Member.find({ userId })
    .populate('workspaceId')
    .sort({ joinedAt: -1 })
    .lean();

  // For each workspace, get a quick stats summary
  const workspacesWithStats = await Promise.all(
    memberships.map(async (membership) => { 
      const workspace    = membership.workspaceId;
      const monitorCount = await Monitor.countDocuments({
        workspaceId: workspace._id,
      });
      const downCount = await Monitor.countDocuments({
        workspaceId: workspace._id,
        status:      'DOWN',
      });

      return {
        ...workspace,
        role:         membership.role,
        joinedAt:     membership.joinedAt,
        monitorCount,
        downCount,
      };
    })
  );

  return workspacesWithStats;
};

// ── getWorkspaceById ────────────────────────────────────────────────────────
export const getWorkspaceById = async (workspaceId) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }
  return workspace;
};

// ── updateWorkspace ─────────────────────────────────────────────────────────
export const updateWorkspace = async (workspaceId, updates) => {
  // Don't allow updating ownerId or apiKey through this function
  const { ownerId, apiKey, ...safeUpdates } = updates;

  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!workspace) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }

  // Invalidate status page cache if settings changed
  await deleteCache(CACHE_KEYS.statusPage(workspace.slug));

  return workspace;
};

// ── rotateApiKey ───────────────────────────────────────────────────────────
// Generates a new API key for the workspace.

export const rotateApiKey = async (workspaceId) => {
  const { v4: uuidv4 } = await import('uuid');
  const newApiKey = `wl_${uuidv4().replace(/-/g, '')}`;

  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { apiKey: newApiKey },
    { new: true }
  ).select('+apiKey'); 

  if (!workspace) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }

  return { apiKey: workspace.apiKey };
};

// ── getWorkspaceApiKey ─────────────────────────────────────────────────────
// Returns the API key — only for owners and admins
export const getWorkspaceApiKey = async (workspaceId) => {
  const workspace = await Workspace.findById(workspaceId).select('+apiKey');
  if (!workspace) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }
  return { apiKey: workspace.apiKey };
};

// ── inviteMember ───────────────────────────────────────────────────────────
// Adds a user to the workspace by email.

export const inviteMember = async ({ workspaceId, email, role, inviterRole }) => {
  // Only owners can add admins
  if (role === 'owner') {
    const err = new Error('Cannot assign owner role — transfer ownership instead');
    err.status = 400;
    throw err;
  }

  if (inviterRole === 'admin' && role === 'admin') {
    const err = new Error('Admins cannot invite other admins');
    err.status = 403;
    throw err;
  }

  // Find the user to invite
  const { User } = await import('../models/index.js');
  const userToInvite = await User.findOne({ email: email.toLowerCase() });
  if (!userToInvite) {
    const err = new Error(`No account found with email: ${email}`);
    err.status = 404;
    throw err;
  }

  // Check workspace member limit
  const workspace  = await Workspace.findById(workspaceId);
  const memberCount = await Member.countDocuments({ workspaceId });

  if (memberCount >= workspace.limits.maxTeamMembers) {
    const err = new Error(
      `Workspace member limit reached (${workspace.limits.maxTeamMembers} members on ${workspace.plan} plan)`
    );
    err.status = 403;
    throw err;
  }

  // Check if already a member
  const existing = await Member.findOne({
    workspaceId,
    userId: userToInvite._id,
  });

  if (existing) {
    const err = new Error('This user is already a member of this workspace');
    err.status = 409;
    throw err;
  }

  const member = await Member.create({
    workspaceId,
    userId: userToInvite._id,
    role,
  });

  return {
    member,
    user: userToInvite.toPublicJSON(),
  };
};

// ── removeMember ───────────────────────────────────────────────────────────
export const removeMember = async ({ workspaceId, memberUserId, requesterRole, requesterId }) => {
  // Can't remove yourself
  if (memberUserId === requesterId) {
    const err = new Error('You cannot remove yourself from the workspace');
    err.status = 400;
    throw err;
  }

  const member = await Member.findOne({
    workspaceId,
    userId: memberUserId,
  });

  if (!member) {
    const err = new Error('Member not found');
    err.status = 404;
    throw err;
  }

  // Can't remove the owner
  if (member.role === 'owner') {
    const err = new Error('The workspace owner cannot be removed');
    err.status = 403;
    throw err;
  }

  // Admins can only remove viewers (not other admins)
  if (requesterRole === 'admin' && member.role === 'admin') {
    const err = new Error('Admins cannot remove other admins');
    err.status = 403;
    throw err;
  }

  await Member.findByIdAndDelete(member._id);
  return { removed: true };
};

// ── getMembers ─────────────────────────────────────────────────────────────
export const getMembers = async (workspaceId) => {
  const members = await Member.find({ workspaceId })
    .populate('userId', 'name email createdAt')
    .sort({ joinedAt: 1 })
    .lean();

  return members.map(m => ({
    memberId:  m._id,
    role:      m.role,
    joinedAt:  m.joinedAt,
    user: m.userId,
  }));
};

// ── updateMemberRole ────────────────────────────────────────────────────────
export const updateMemberRole = async ({
  workspaceId, memberUserId, newRole, requesterRole,
}) => {
  if (newRole === 'owner') {
    const err = new Error('Use transfer ownership to change the owner');
    err.status = 400;
    throw err;
  }

  if (requesterRole !== 'owner') {
    const err = new Error('Only the workspace owner can change member roles');
    err.status = 403;
    throw err;
  }

  const member = await Member.findOneAndUpdate(
    { workspaceId, userId: memberUserId },
    { role: newRole },
    { new: true }
  ).populate('userId', 'name email');

  if (!member) {
    const err = new Error('Member not found');
    err.status = 404;
    throw err;
  }

  return member;
};