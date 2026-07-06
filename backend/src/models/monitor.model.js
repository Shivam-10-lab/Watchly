import mongoose from 'mongoose';

const monitorSchema = new mongoose.Schema(
  {
    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
      index:    true,
    },

    name: {
      type:      String,
      required:  [true, 'Monitor name is required'],
      trim:      true,
      maxlength: [100, 'Monitor name cannot exceed 100 characters'],
    },

    url: {
      type:     String,
      required: [true, 'URL is required'],
      trim:     true,
    },

    intervalSeconds: {
      type:    Number,
      default: 60,
      enum:    [30, 60, 120, 300, 600, 1800],
    },

    type: {
      type:    String,
      enum:    ['http', 'keyword', 'ssl'],
      default: 'http',
      // http    — checks status code and response time
      // keyword — also checks if a keyword exists in the response body
      // ssl     — checks SSL certificate validity and expiry
    },

    expectedStatusCode: {
      type:    Number,
      default: 200,
    },

    keywordToFind: {
      type:    String,
      default: '',
    },

   
    degradedThresholdMs: {
      type:    Number,
      default: 2000,
    },

   
    method: {
      type:    String,
      enum:    ['GET', 'POST', 'HEAD'],
      default: 'GET',
    },

    // Optional custom headers to send with each check (e.g. Authorization)
    headers: {
      type:    Map,
      of:      String,
      default: {},
    },

    // ── Current live state ─────────────────────────────────────────────────
    // These are updated after every check by the check worker
    status: {
      type:    String,
      enum:    ['UP', 'DOWN', 'DEGRADED', 'PAUSED', 'PENDING'],
      default: 'PENDING',
      index:   true,
    },

    lastCheckedAt: {
      type:    Date,
      default: null,
    },

    lastStatusChangeAt: {
      type:    Date,
      default: null,
    },

    lastResponseTimeMs: {
      type:    Number,
      default: null,
    },

    
    consecutiveFailures: {
      type:    Number,
      default: 0,
    },

    consecutiveSuccesses: {
      type:    Number,
      default: 0,
    },

    
    failureThreshold: {
      type:    Number,
      default: 2,
     
    },

    
    recoveryThreshold: {
      type:    Number,
      default: 2,
    },

    // BullMQ job ID 
    schedulerJobId: {
      type:    String,
      default: null,
    },

    // ── Runbook ────────────────────────────────────────────────────────────
    
    runbookUrl: {
      type:    String,
      default: null,
    },

    // ── Notification channels ──────────────────────────────────────────────
    notifications: {
      email: {
        enabled:    { type: Boolean, default: true },
        recipients: [{ type: String }],
      },
      webhook: {
        enabled: { type: Boolean, default: false },
        url:     { type: String,  default: null   },
      },
    },

    isPaused: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
monitorSchema.index({ workspaceId: 1, status: 1 });
monitorSchema.index({ workspaceId: 1, createdAt: -1 });
monitorSchema.index({ status: 1 }); // for "find all down monitors" queries

const Monitor = mongoose.model('Monitor', monitorSchema);
export default Monitor;