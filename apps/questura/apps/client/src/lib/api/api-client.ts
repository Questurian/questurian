/**
 * Core API request client.
 *
 * Status before body, a deadline on every request, the caller's cancellation
 * respected, and no automatic retry here — retries belong to the caller's
 * policy (`request-policy.ts`), because only a read is safe to repeat.
 */

import { getApiHeaders, getBackendUrl } from './api-config';
import { executeRequest } from './request-policy';

export type ApiRequestOptions = RequestInit & {
  /** Give up after this long. Defaults to `DEFAULT_TIMEOUT_MS` (10 s). */
  timeoutMs?: number;
};

/**
 * Make an API request with the site's credentials.
 *
 * Throws `RequestError` (exported as `APIError`) for every failure: the HTTP
 * status and `Retry-After` are read before the body, so an HTML challenge or
 * overload page is classified rather than surfacing as "Invalid JSON".
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { timeoutMs, signal, ...init } = options;

  return executeRequest<T>({
    fetchImpl: (url, requestInit) => fetch(url, requestInit),
    url: `${getBackendUrl()}${endpoint}`,
    init: {
      ...init,
      headers: {
        ...getApiHeaders(init),
        ...init.headers,
      },
      credentials: 'include',
    },
    timeoutMs,
    signal,
  });
}
