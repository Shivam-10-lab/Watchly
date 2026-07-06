import axios from 'axios';
import https from 'https';
import tls   from 'tls';

// ── Main check function ────────────────────────────────────────────────────
// Takes a monitor config, makes the HTTP request, returns a structured result.
// This function never throws — it always returns a result object
// (failures are captured in the result, not thrown as exceptions)
export const performCheck = async (monitor) => {
  const startTime = Date.now();

  try {
    // ── Make the HTTP request ────────────────────────────────────────────
    const response = await axios({
      method:  monitor.method || 'GET',
      url:     monitor.url,
      timeout: parseInt(process.env.DEFAULT_CHECK_TIMEOUT_MS) || 10000,
      headers: {
        'User-Agent':   'Watchly-Monitor/1.0',
        'Accept':       '*/*',
        // Spread any custom headers the user configured on this monitor
        ...(monitor.headers ? Object.fromEntries(monitor.headers) : {}),
      },
      // Don't throw on non-2xx status codes — we want to inspect them
      validateStatus: () => true,
      // Don't follow redirects — a redirect IS a valid response for us
      maxRedirects: 5,
      // Decompress gzip/brotli responses automatically
      decompress: true,
    });

    const responseTimeMs = Date.now() - startTime;
    const statusCode     = response.status;

    // ── Determine status ─────────────────────────────────────────────────
    const expectedCode = monitor.expectedStatusCode || 200;
    const isStatusOk   = statusCode === expectedCode;

    // For keyword monitors: check if the keyword appears in the body
    let keywordFound = null;
    if (monitor.type === 'keyword' && monitor.keywordToFind) {
      const body   = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
      keywordFound = body.includes(monitor.keywordToFind);
    }

    // ── SSL check ────────────────────────────────────────────────────────
    let sslValid         = null;
    let sslDaysRemaining = null;

    if (monitor.url.startsWith('https://') &&
       (monitor.type === 'ssl' || monitor.type === 'http')) {
      const sslResult = await checkSSL(monitor.url);
      sslValid         = sslResult.valid;
      sslDaysRemaining = sslResult.daysRemaining;
    }

    // ── Final status determination ────────────────────────────────────────
    // Order matters:
    // 1. Wrong status code → DOWN
    // 2. Keyword not found → DOWN
    // 3. Response too slow → DEGRADED
    // 4. Everything fine  → UP
    let status;
    let errorMessage = null;

    if (!isStatusOk) {
      status       = 'DOWN';
      errorMessage = `Expected status ${expectedCode}, got ${statusCode}`;
    } else if (monitor.type === 'keyword' && keywordFound === false) {
      status       = 'DOWN';
      errorMessage = `Keyword '${monitor.keywordToFind}' not found in response body`;
    } else if (responseTimeMs > (monitor.degradedThresholdMs || 2000)) {
      status = 'DEGRADED';
    } else {
      status = 'UP';
    }

    return {
      status,
      statusCode,
      responseTimeMs,
      keywordFound,
      sslValid,
      sslDaysRemaining,
      errorMessage,
    };

  } catch (err) {
    // Request never completed — timeout, DNS failure, connection refused
    const responseTimeMs = Date.now() - startTime;

    // Map axios error codes to human-readable messages
    let errorMessage;
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      errorMessage = `Request timed out after ${responseTimeMs}ms`;
    } else if (err.code === 'ENOTFOUND') {
      errorMessage = `DNS lookup failed for ${monitor.url}`;
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused to ${monitor.url}`;
    } else if (err.code === 'ECONNRESET') {
      errorMessage = 'Connection was reset by the server';
    } else {
      errorMessage = err.message || 'Unknown error';
    }

    return {
      status:          'DOWN',
      statusCode:      null,
      responseTimeMs,
      keywordFound:    null,
      sslValid:        null,
      sslDaysRemaining:null,
      errorMessage,
    };
  }
};

// ── SSL certificate checker ────────────────────────────────────────────────
// Connects to the server over TLS and reads the certificate expiry date
// without making a full HTTP request (faster, and works even if HTTP is broken)
const checkSSL = (url) => {
  return new Promise((resolve) => {
    try {
      const { hostname } = new URL(url);

      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname },
        () => {
          const cert  = socket.getPeerCertificate();
          socket.end();

          if (!cert || !cert.valid_to) {
            return resolve({ valid: false, daysRemaining: 0 });
          }

          const expiresAt      = new Date(cert.valid_to);
          const now            = new Date();
          const daysRemaining  = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
          const valid          = daysRemaining > 0;

          resolve({ valid, daysRemaining });
        }
      );

      socket.on('error', () => {
        resolve({ valid: false, daysRemaining: 0 });
      });

      // Timeout the SSL check after 5 seconds
      socket.setTimeout(5000, () => {
        socket.end();
        resolve({ valid: false, daysRemaining: 0 });
      });

    } catch {
      resolve({ valid: false, daysRemaining: 0 });
    }
  });
};