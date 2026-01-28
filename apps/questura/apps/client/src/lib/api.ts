/**
 * Shared API utilities for making authenticated requests to the backend
 */

import { config } from './config';

/**
 * Custom error class for API errors that includes status code
 */
export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Get the backend URL from environment
 * Calls the backend directly (no proxy needed for localhost or same-domain deployments)
 */
export function getBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
}

/**
 * Get common headers for API requests
 */
export function getApiHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  return headers;
}

/**
 * Make an authenticated API request
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
    credentials: "include",
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

/**
 * Make a GET request
 */
export async function get<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "GET" });
}

/**
 * Make a POST request
 */
export async function post<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a PUT request
 */
export async function put<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a DELETE request
 */
export async function del<T = unknown>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "DELETE" });
}

/**
 * Detect if an error is a service unavailability error
 * Returns true if the error indicates the backend service is down
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for network-level errors (connection refused, timeout, etc.)
    if (
      message.includes('failed to fetch') ||
      message.includes('connection refused') ||
      message.includes('network error') ||
      message.includes('timeout')
    ) {
      return true;
    }

    // Check for 5xx errors (server errors)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true;
    }

    // Check for invalid JSON response (likely HTML error page from proxy)
    if (message.includes('invalid json response')) {
      return true;
    }
  }

  return false;
}
