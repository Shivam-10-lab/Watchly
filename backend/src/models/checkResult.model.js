import mongoose from 'mongoose';

const checkResultSchema = new mongoose.Schema(
  {
    // metaField — identifies WHAT is being measured
    // MongoDB uses this for efficient partitioning of time-series data
    monitorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Monitor',
      required: true,
    },

    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
    },

    // timeField — WHEN the check happened
    // MongoDB requires the timeField to be an actual Date, not a string
    checkedAt: {
      type:     Date,
      required: true,
      default:  () => new Date(),
    },

    // Result fields
    status: {
      type:    String,
      enum:    ['UP', 'DOWN', 'DEGRADED'],
      required: true,
    },

    statusCode: {
      type:    Number,
      default: null,
      // null if the request never got a response (network error, timeout)
    },

    responseTimeMs: {
      type:    Number,
      default: null,
    },

    // Did the response body contain the expected keyword?
    // Only relevant for 'keyword' type monitors
    keywordFound: {
      type:    Boolean,
      default: null,
    },

    // Is the SSL certificate valid and not expiring soon?
    sslValid: {
      type:    Boolean,
      default: null,
    },

    // Days until SSL certificate expires (null if not checked)
    sslDaysRemaining: {
      type:    Number,
      default: null,
    },

    // If the check failed: why did it fail?
    errorMessage: {
      type:    String,
      default: null,
    },

    // Was this check part of triggering an incident?
    triggeredIncident: {
      type:    Boolean,
      default: false,
    },
  },
  {
    // Do NOT use { timestamps: true } here.
    // We defined checkedAt manually as our timeField.
    // Adding mongoose timestamps would add a second createdAt which
    // conflicts with time-series collection requirements.
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary query: "give me all checks for monitor X in the last 24 hours"
checkResultSchema.index({ monitorId: 1, checkedAt: -1 });

// For workspace-level analytics
checkResultSchema.index({ workspaceId: 1, checkedAt: -1 });

// ── Model with time-series collection ─────────────────────────────────────────
// We override the default collection creation to use MongoDB time-series.
// This runs once at startup via our DB initialization function.
export const ensureTimeSeriesCollection = async () => {
  try {
    const db          = mongoose.connection.db;
    const collections = await db.listCollections({ name: 'checkresults' }).toArray();

    if (collections.length === 0) {
      await db.createCollection('checkresults', {
        timeseries: {
          timeField:   'checkedAt',
          metaField:   'monitorId',
          granularity: 'seconds',
        },
        // Auto-delete documents older than 90 days
        // You never need to write a cleanup cron job for this collection
        expireAfterSeconds: 90 * 24 * 60 * 60,
      });
      console.log('✅ CheckResult time-series collection created');
    }
  } catch (err) {
    // If the collection already exists, MongoDB throws a harmless error
    if (err.codeName !== 'NamespaceExists') {
      console.error('Error creating time-series collection:', err.message);
    }
  }
};

const CheckResult = mongoose.model('CheckResult', checkResultSchema);
export default CheckResult;