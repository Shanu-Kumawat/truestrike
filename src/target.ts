const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class TargetScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetScopeError';
  }
}

/**
 * Validates and normalizes a scan target against the scope allowlist.
 *
 * TrueStrike only ever acts against explicitly authorized targets. Loopback
 * hosts (where the local OWASP Juice Shop demo runs) are always allowed;
 * anything else must be explicitly listed via TRUESTRIKE_ALLOW_HOSTS.
 *
 * @returns the normalized URL string
 * @throws TargetScopeError when the URL is invalid or the host is out of scope
 */
export function validateTarget(rawTarget: string, extraAllowedHosts: string[] = []): string {
  let url: URL;
  try {
    url = new URL(rawTarget);
  } catch {
    throw new TargetScopeError(
      `Invalid target URL: "${rawTarget}". Provide a full URL, e.g. http://localhost:3000`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetScopeError(
      `Unsupported protocol "${url.protocol}". Only http:// and https:// targets are supported.`,
    );
  }

  const host = url.hostname.toLowerCase();
  const allowed = LOOPBACK_HOSTS.has(host) || extraAllowedHosts.includes(host);
  if (!allowed) {
    throw new TargetScopeError(
      `Target "${host}" is not in the authorized scope. ` +
        'Only loopback targets (localhost/127.0.0.1) are allowed by default. ' +
        'Add explicitly authorized hosts via TRUESTRIKE_ALLOW_HOSTS.',
    );
  }

  return url.toString();
}
