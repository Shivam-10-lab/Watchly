import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
      index:    true,
    },

    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    role: {
      type:    String,
      enum:    ['owner', 'admin', 'viewer'],
      default: 'viewer',
      // owner  — can delete workspace, manage billing, all admin actions
      // admin  — can create/delete monitors, invite/remove members
      // viewer — read-only access to dashboard and incidents
    },

    // When the user accepted the invitation
    joinedAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ── Compound unique index ─────────────────────────────────────────────────────
// Prevents the same user being added to the same workspace twice
memberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

// ── For "get all workspaces a user belongs to" query ─────────────────────────
memberSchema.index({ userId: 1, joinedAt: -1 });

const Member = mongoose.model('Member', memberSchema);
export default Member;