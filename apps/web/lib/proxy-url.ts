const DEFAULT_API_URL = 'http://localhost:4000';

/**
 * Resolve and validate the backend origin used by Next.js `/api/*` rewrites.
 */
export function resolveApiProxyTarget(rawUrl?: string): string {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return DEFAULT_API_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid API_URL: "${trimmed}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`API_URL must use http or https protocol (got ${parsed.protocol})`);
  }

  return trimmed.replace(/\/+$/, '');
}
