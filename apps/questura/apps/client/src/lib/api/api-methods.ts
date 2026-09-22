/**
 * HTTP method wrappers around apiRequest.
 */

import { apiRequest } from './api-client';

/**
 * Make a GET request. `signal` cancels it; a cancelled read is reported as
 * `aborted`, never as a failure of identity.
 */
export async function get<T = unknown>(endpoint: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET', signal: options.signal });
}

/**
 * Make a POST request.
 */
export async function post<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a PUT request.
 */
export async function put<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a DELETE request.
 */
export async function del<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}
