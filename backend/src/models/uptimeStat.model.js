import mongoose from 'mongoose';

const uptimeStatSchema = new mongoose.Schema(
  {
    monitorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Monitor',
      required: true,
      index:    true,
    },

    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
    },

    hour: {
      type:     Date,
      required: true,
      index:    true,
    },

    // ── Computed values ─────────────────────────────────────────────────────
    totalChecks:   { type: Number, default: 0 },
    upChecks:      { type: Number, default: 0 },
    downChecks:    { type: Number, default: 0 },
    degradedChecks:{ type: Number, default: 0 },

    // 0–100 percentage
    uptimePercent: { type: Number, default: 100 },

    // Response time statistics in milliseconds
    avgResponseMs: { type: Number, default: null },
    minResponseMs: { type: Number, default: null },
    maxResponseMs: { type: Number, default: null },
    p50ResponseMs: { type: Number, default: null },
    p95ResponseMs: { type: Number, default: null },
  },
  { timestamps: true }
);

// ── Compound unique index ─────────────────────────────────────────────────────
// Each monitor has at most one stat document for that particular hour.
uptimeStatSchema.index({ monitorId: 1, hour: 1 }, { unique: true });

// For "last 24 hours of stats" queries
uptimeStatSchema.index({ monitorId: 1, hour: -1 });

// Auto-delete stats older than 365 days (use the updatedAt timestamp)
uptimeStatSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 }
);

const UptimeStat = mongoose.model('UptimeStat', uptimeStatSchema);
export default UptimeStat;