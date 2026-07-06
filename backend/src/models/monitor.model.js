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

    // How often to check this monitor (in seconds)
    intervalSeconds: {
      type:    Number,
      default: 60,
      enum:    [30, 60, 120, 300, 600, 1800],
      // 30s, 1min, 2min, 5min, 10min, 30min
    },

    type: {
      type:    String,
      enum:    ['http', 'keyword', 'ssl'],
      default: 'http',
      // http    — checks status code and response time
      // keyword — also checks if a keyword exists in the response body
      // ssl     — checks SSL certificate validity and expiry
    },

    // For HTTP and keyword monitors
    expectedStatusCode: {
      type:    Number,
      default: 200,
    },

    // For keyword monitors: response body must contain this string
    keywordToFind: {
      type:    String,
      default: '',
    },

    // How many milliseconds before a response is considered "slow"
    // A slow response changes status to DEGRADED even if status code is 200
    degradedThresholdMs: {
      type:    Number,
      default: 2000,
    },

    // HTTP method to use when checking
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
      // PENDING  — just created, first check hasn't run yet
      // UP       — last check succeeded within threshold
      // DOWN     — consecutive failures exceeded threshold
      // DEGRADED — responding but slower than degradedThresholdMs
      // PAUSED   — monitoring intentionally paused by user
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

    // The response time (ms) of the most recent check
    lastResponseTimeMs: {
      type:    Number,
      default: null,
    },

    // Running count of consecutive failures
    // Used by the state engine to avoid flip-flopping on a single failure
    consecutiveFailures: {
      type:    Number,
      default: 0,
    },

    consecutiveSuccesses: {
      type:    Number,
      default: 0,
    },

    // How many consecutive failures before declaring DOWN
    failureThreshold: {
      type:    Number,
      default: 2,
      // 2 means: fail twice in a row → status becomes DOWN
      // This prevents a single blip from triggering an incident
    },

    // How many consecutive successes before declaring recovery
    recoveryThreshold: {
      type:    Number,
      default: 2,
    },

    // BullMQ job ID — stored so we can remove the job when deleting a monitor
    schedulerJobId: {
      type:    String,
      default: null,
    },

    // ── Runbook ────────────────────────────────────────────────────────────
    // URL of the PDF/markdown file stored in Cloudinary
    runbookUrl: {
      type:    String,
      default: null,
    },

    // ── Notification channels ──────────────────────────────────────────────
    notifications: {
      email: {
        enabled:    { type: Boolean, default: true },
        // Additional email recipients beyond workspace members
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