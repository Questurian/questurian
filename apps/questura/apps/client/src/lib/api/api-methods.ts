/**
 * HTTP method wrappers around apiRequest.
 */

import { apiRequest } from './api-client';

/**
 * Make a GET request.
 */
export async function get<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
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
