import { v4 as uuidv4 } from 'uuid';

// ── Request logger ─────────────────────────────────────────────────────────
// Logs every request with:
// - A unique requestId (for tracing a request across log lines)
// - Method, path, status code
// - Duration in milliseconds
// - The user making the request (if authenticated)
//
// In production you'd send these to a log aggregator (Datadog, Papertrail)
// and filter by requestId to see the full lifecycle of any request
export const requestLogger = (req, res, next) => {
  // Attach requestId if not already set by index.js
  if (!req.requestId) {
    req.requestId = uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
  }

  const startTime = Date.now();

  // Log when the RESPONSE finishes (not when the request starts)
  // This way we know both the status code and the duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status   = res.statusCode;

    // Color-code by status range (only works in development terminal)
    const statusColor =
      status >= 500 ? '\x1b[31m' :  // red for 5xx errors
      status >= 400 ? '\x1b[33m' :  // yellow for 4xx client errors
      status >= 300 ? '\x1b[36m' :  // cyan for 3xx redirects
                      '\x1b[32m';   // green for 2xx success
    const reset = '\x1b[0m';

    const userId = req.user?.userId || 'anonymous';

    // Structured log line — each field is separately parseable
    // In production, log as JSON for easy querying
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({
        requestId: req.requestId,
        method:    req.method,
        path:      req.path,
        status,
        duration:  `${duration}ms`,
        userId,
        ip:        req.ip,
        userAgent: req.get('User-Agent'),
      }));
    } else {
      // Pretty print for development
      console.log(
        `[${req.requestId.slice(0,8)}] ` +
        `${req.method.padEnd(6)} ` +
        `${statusColor}${status}${reset} ` +
        `${req.path.padEnd(40)} ` +
        `${duration}ms ` +
        `(${userId})`
      );
    }
  });

  next();
};