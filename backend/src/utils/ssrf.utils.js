import dns            from 'dns/promises';
import ipRangeCheck   from 'ip-range-check';

// ── Private IP ranges to block ─────────────────────────────────────────────

const PRIVATE_IP_RANGES = [
  '10.0.0.0/8',       // Private network (RFC 1918)
  '172.16.0.0/12',    // Private network (RFC 1918)
  '192.168.0.0/16',   // Private network (RFC 1918)
  '127.0.0.0/8',      // Loopback (localhost)
  '169.254.0.0/16',   // Link-local — THIS is the AWS/GCP/Azure metadata IP
                       // curl http://169.254.169.254/latest/meta-data/ on AWS
                       // returns IAM credentials, SSH keys, and more
  '100.64.0.0/10',    // Shared address space (RFC 6598)
  '::1/128',          // IPv6 loopback
  'fc00::/7',         // IPv6 unique local
  'fe80::/10',        // IPv6 link-local
];

// ── Validate a user-provided URL is safe to request ───────────────────────

export const validateWebhookUrl = async (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      safe:   false,
      reason: `Protocol '${parsed.protocol}' is not allowed. Use http or https.`,
    };
  }

  // Step 3: Resolve the hostname to IP addresses
  
  let addresses;
  try {
    addresses = await dns.resolve4(parsed.hostname);
  } catch {
    // If the hostname doesn't resolve, it's not reachable — block it
    return { safe: false, reason: `Could not resolve hostname: ${parsed.hostname}` };
  }

  // Check every resolved IP against the private ranges
  for (const ip of addresses) {
    if (ipRangeCheck(ip, PRIVATE_IP_RANGES)) {
      return {
        safe:   false,
        reason: `URL resolves to a private IP address (${ip}). Webhook URLs must point to public internet addresses.`,
      };
    }
  }

  // (in case DNS resolution missed it)
  const blockedHostnames = ['localhost', '0.0.0.0', '[::]', '[::1]'];
  if (blockedHostnames.includes(parsed.hostname.toLowerCase())) {
    return { safe: false, reason: 'Localhost URLs are not allowed' };
  }

  return { safe: true };
};

// ── Convenience: throw if URL is unsafe ────────────────────────────────────

export const assertWebhookUrlSafe = async (url) => {
  const result = await validateWebhookUrl(url);
  if (!result.safe) {
    const err = new Error(result.reason);
    err.code  = 'SSRF_BLOCKED';
    throw err;
  }
};