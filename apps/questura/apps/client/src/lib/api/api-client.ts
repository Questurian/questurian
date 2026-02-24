/**
 * Core API request client.
 */

import { getApiHeaders, getBackendUrl } from './api-config';
import { APIError } from './api-errors';

/**
 * Make an authenticated API request.
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getApiHeaders(),
      ...options.headers,
    },
    credentials: 'include',
  });

  const responseText = await response.text();
  let data: T;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON response: ${responseText}`);
  }

  if (!response.ok) {
    const errorData = data as { error?: string; message?: string };
    throw new APIError(
      response.status,
      errorData.error ||
        errorData.message ||
        `Request failed with status ${response.status}`
    );
  }

  return data;
}
