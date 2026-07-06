import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Workspace name is required'],
      trim:      true,
      maxlength: [50, 'Workspace name cannot exceed 50 characters'],
    },

    // URL-friendly identifier for the public status page
  
    slug: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
      match: [
        /^[a-z0-9-]+$/,
        'Slug can only contain lowercase letters, numbers, and hyphens',
      ],
    },

    // The user who created this workspace
    ownerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // API key for programmatic access (no JWT needed)
    // Format: wl_<uuid> — easy to identify in logs
    apiKey: {
      type:    String,
      unique:  true,
      default: () => `wl_${uuidv4().replace(/-/g, '')}`,
      select:  false,
  
    },

    // Public status page visibility
    statusPageEnabled: {
      type:    Boolean,
      default: true,
    },

    // Custom message shown on the status page
    statusPageMessage: {
      type:    String,
      default: '',
      maxlength: 200,
    },

    plan: {
      type:    String,
      enum:    ['free', 'pro', 'enterprise'],
      default: 'free',
    },

    // Plan limits
    limits: {
      maxMonitors:          { type: Number, default: 10  },
      minCheckIntervalSecs: { type: Number, default: 60  },
      maxTeamMembers:       { type: Number, default: 3   },
      historyRetentionDays: { type: Number, default: 30  },
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
workspaceSchema.index({ slug: 1 });
workspaceSchema.index({ ownerId: 1 });

// ── Static: generate a unique slug from workspace name ────────────────────────

workspaceSchema.statics.generateSlug = async function (name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  let slug   = base;
  let suffix = 1;

  while (await this.exists({ slug })) {
    slug = `${base}-${suffix}`;
    suffix++;
  }

  return slug;
};

const Workspace = mongoose.model('Workspace', workspaceSchema);
export default Workspace;