import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema(
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
      index:    true,
    },

    // ── Timeline ────────────────────────────────────────────────────────────
    startedAt: {
      type:     Date,
      required: true,
      default:  () => new Date(),
    },

    // null while the incident is still ongoing
    resolvedAt: {
      type:    Date,
      default: null,
    },

    // Computed when resolvedAt is set
    durationSeconds: {
      type:    Number,
      default: null,
    },

    
    status: {
      type:    String,
      enum:    ['ongoing', 'resolved'],
      default: 'ongoing',
      index:   true,
    },

    
    acknowledged: {
      type:    Boolean,
      default: false,
    },

    acknowledgedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    acknowledgedAt: {
      type:    Date,
      default: null,
    },

    // ── Context ─────────────────────────────────────────────────────────────
    // The HTTP status code that triggered the incident
    triggerStatusCode: {
      type:    Number,
      default: null,
    },

    
    triggerErrorMessage: {
      type:    String,
      default: null,
    },

   
    postmortem: {
      type:    String,
      default: '',
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Most common query: "active incidents for workspace X"
incidentSchema.index({ workspaceId: 1, status: 1 });

// "All incidents for monitor X, newest first"
incidentSchema.index({ monitorId: 1, startedAt: -1 });

// "All incidents for workspace X, newest first" (for incident list page)
incidentSchema.index({ workspaceId: 1, startedAt: -1 });

// ── Static method ────────────────────────────────────────
incidentSchema.statics.openIncident = async function ({
  monitorId, workspaceId, statusCode, errorMessage,
}) {
  return this.create({
    monitorId,
    workspaceId,
    startedAt:           new Date(),
    status:              'ongoing',
    triggerStatusCode:   statusCode,
    triggerErrorMessage: errorMessage,
  });
};

// ── Instance method ─────────────────────────────────────
incidentSchema.methods.resolve = async function () {
  const now             = new Date();
  this.resolvedAt       = now;
  this.status           = 'resolved';
  this.durationSeconds  = Math.floor((now - this.startedAt) / 1000);
  return this.save();
};

const Incident = mongoose.model('Incident', incidentSchema);
export default Incident;