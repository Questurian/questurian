/**
 * Base API client configuration
 */

import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const error: ApiResponse<T> = await response.json();
      throw new ApiError(
        error.error || "An error occurred",
        response.status,
        error.code,
        error.details
      );
    }
    throw new ApiError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  if (isJson) {
    const data: ApiResponse<T> = await response.json();
    if (data.success && data.data !== undefined) {
      return data.data;
    }
    return data as T;
  }

  return response as T;
}

/**
 * Unwrap entry field from API responses
 * Some endpoints return { entry: T } instead of { data: T }
 */
export function unwrapEntry<T>(response: { entry: T }): T {
  return response.entry;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  let url: string;

  if (API_BASE_URL) {
    const urlObj = new URL(path, API_BASE_URL);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        urlObj.searchParams.append(key, value);
      });
    }
    url = urlObj.toString();
  } else {
    // Use relative URL for Vite proxy
    const searchParams = params ? "?" + new URLSearchParams(params).toString() : "";
    url = path + searchParams;
  }

  const response = await fetch(url);
  return handleResponse<T>(response);
}

export async function apiPost<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const url = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(
  path: string,
  body: unknown
): Promise<T> {
  const url = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPostFormData<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const url = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(
  path: string
): Promise<T> {
  const url = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
  const response = await fetch(url, {
    method: "DELETE",
  });
  return handleResponse<T>(response);
}
