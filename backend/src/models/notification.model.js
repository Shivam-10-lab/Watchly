import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
      index:    true,
    },

    monitorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Monitor',
      required: true,
    },

    incidentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Incident',
      required: true,
      index:    true,
    },

    // What triggered this notification
    event: {
      type:    String,
      enum:    ['incident_opened', 'incident_resolved', 'ssl_expiring'],
      required: true,
    },

    // Which channel this notification went through
    channel: {
      type:    String,
      enum:    ['email', 'webhook'],
      required: true,
    },

    // Who received it (email address or webhook URL)
    recipient: {
      type:     String,
      required: true,
    },

    // ── Delivery state ──────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['pending', 'sent', 'failed'],
      default: 'pending',
      index:   true,
    },

    // How many delivery attempts have been made
    attempts: {
      type:    Number,
      default: 0,
    },

    lastAttemptAt: {
      type:    Date,
      default: null,
    },

    sentAt: {
      type:    Date,
      default: null,
    },

    // Error message from the last failed attempt
    lastError: {
      type:    String,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
notificationSchema.index({ incidentId: 1, channel: 1 });
notificationSchema.index({ status: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;