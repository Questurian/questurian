/**
 * API endpoint and header configuration helpers.
 */

/**
 * Get the backend URL from environment.
 * Calls the backend directly (no proxy needed for localhost or same-domain deployments).
 */
export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
}

/**
 * Common headers for an API request.
 *
 * `Content-Type: application/json` only when there is a body. On a bodyless
 * cross-origin GET it served no purpose and made every `/api/me`, refs and
 * member-body read a non-simple request, so the browser sent a CORS preflight
 * (`OPTIONS`) first — an extra round trip per read, doubled during exactly the
 * burst the backend is trying to absorb. CORS policy itself is unchanged.
 */
export function getApiHeaders(init: { body?: unknown } = {}): HeadersInit {
  return init.body === undefined || init.body === null ? {} : { 'Content-Type': 'application/json' };
}
