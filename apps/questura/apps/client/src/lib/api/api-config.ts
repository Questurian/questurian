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
 * Get common headers for API requests.
 */
export function getApiHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  return headers;
}
