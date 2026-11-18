const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

export interface WakeupRetryOptions {
  path: string;
  method?: string;
  maxRetries?: number;
  delayMs?: number;
  onWakingUp?: (attempt: number) => void;
}

/**
 * Only retry idempotent GET/HEAD reads and session auth endpoints during Render cold starts.
 */
export function canRetryWakeupRequest(path: string, method = 'GET'): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'GET' || upperMethod === 'HEAD') {
    return true;
  }

  return path.includes('/auth/login') || path.includes('/auth/refresh');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient proxy/cold-start gateway failures (`502`, `503`, `504` or network errors).
 */
export async function fetchWithWakeupRetry(
  performFetch: () => Promise<Response>,
  options: WakeupRetryOptions,
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const delayMs = options.delayMs ?? 2000;
  const retryAllowed = canRetryWakeupRequest(options.path, options.method);

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await performFetch();
      if (
        !retryAllowed ||
        !TRANSIENT_GATEWAY_STATUSES.has(response.status) ||
        attempt >= maxRetries
      ) {
        return response;
      }
    } catch (error) {
      if (!retryAllowed || attempt >= maxRetries) {
        throw error;
      }
    }

    options.onWakingUp?.(attempt + 1);
    await sleep(delayMs);
  }
}
