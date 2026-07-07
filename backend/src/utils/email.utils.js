import nodemailer from 'nodemailer';

// ── Create transporter (lazily — only when first email is sent) ─────────────
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

// ── HTML email templates ────────────────────────────────────────────────────

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 580px; margin: 0 auto; background: white;
                 border-radius: 8px; overflow: hidden;
                 box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { padding: 24px 32px; background: #0f0f13; }
    .header h1 { margin: 0; color: white; font-size: 20px; font-weight: 700; }
    .header span { color: #f84464; }
    .body { padding: 32px; color: #333; }
    .alert-box { border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .alert-down { background: #fef2f2; border-left: 4px solid #ef4444; }
    .alert-up   { background: #f0fdf4; border-left: 4px solid #22c55e; }
    .alert-box h2 { margin: 0 0 8px; font-size: 16px; }
    .detail-row { display: flex; justify-content: space-between;
                  padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { font-weight: 500; color: #111; }
    .footer { padding: 20px 32px; background: #f9f9f9; font-size: 12px; color: #999;
              border-top: 1px solid #eee; text-align: center; }
    .btn { display: inline-block; background: #0f0f13; color: white;
           padding: 12px 24px; border-radius: 6px; text-decoration: none;
           font-weight: 600; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Watch<span>ly</span></h1>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      You're receiving this because you're a member of a Watchly workspace.
      <br>Watchly — Real-time API & Website Monitoring
    </div>
  </div>
</body>
</html>
`;

// ── Email senders ───────────────────────────────────────────────────────────

// Sent when a monitor goes DOWN and an incident is opened
export const sendAlertEmail = async ({
  to,            // string or string[] of recipient emails
  monitorName,
  monitorUrl,
  statusCode,
  errorMessage,
  incidentId,
  dashboardUrl,
}) => {
  const subject = `🔴 DOWN: ${monitorName} is unreachable`;

  const html = baseTemplate(`
    <div class="alert-box alert-down">
      <h2>🔴 ${monitorName} is down</h2>
      <p style="margin:0;color:#666;font-size:14px;">
        We detected an issue and have opened an incident.
      </p>
    </div>

    <div>
      <div class="detail-row">
        <span class="label">URL</span>
        <span class="value">${monitorUrl}</span>
      </div>
      <div class="detail-row">
        <span class="label">Status Code</span>
        <span class="value">${statusCode || 'No response'}</span>
      </div>
      <div class="detail-row">
        <span class="label">Error</span>
        <span class="value">${errorMessage || 'Connection failed'}</span>
      </div>
      <div class="detail-row">
        <span class="label">Time</span>
        <span class="value">${new Date().toUTCString()}</span>
      </div>
      <div class="detail-row">
        <span class="label">Incident ID</span>
        <span class="value">${incidentId}</span>
      </div>
    </div>

    <a href="${dashboardUrl}" class="btn">View Incident →</a>
  `);

  return sendEmail({ to, subject, html });
};

// Sent when a monitor recovers and the incident is closed
export const sendRecoveryEmail = async ({
  to,
  monitorName,
  monitorUrl,
  durationSeconds,
  incidentId,
  dashboardUrl,
}) => {
  const duration  = formatDuration(durationSeconds);
  const subject   = `✅ RECOVERED: ${monitorName} is back online`;

  const html = baseTemplate(`
    <div class="alert-box alert-up">
      <h2>✅ ${monitorName} is back online</h2>
      <p style="margin:0;color:#666;font-size:14px;">
        The incident has been resolved automatically.
      </p>
    </div>

    <div>
      <div class="detail-row">
        <span class="label">URL</span>
        <span class="value">${monitorUrl}</span>
      </div>
      <div class="detail-row">
        <span class="label">Downtime Duration</span>
        <span class="value">${duration}</span>
      </div>
      <div class="detail-row">
        <span class="label">Recovered At</span>
        <span class="value">${new Date().toUTCString()}</span>
      </div>
      <div class="detail-row">
        <span class="label">Incident ID</span>
        <span class="value">${incidentId}</span>
      </div>
    </div>

    <a href="${dashboardUrl}" class="btn">View Incident →</a>
  `);

  return sendEmail({ to, subject, html });
};

// ── Core send function ────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    const transport = getTransporter();

    // to can be a string ("user@example.com") or an array
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    const info = await transport.sendMail({
      from:    process.env.EMAIL_FROM || 'Watchly <noreply@watchly.dev>',
      to:      recipients,
      subject,
      html,
    });

    console.log(`📧 Email sent to ${recipients}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };

  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err; // Re-throw so the notification worker can retry
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────
const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown';
  if (seconds < 60)   return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};