export const AUTH_STORAGE_KEY = 'payload_auth';
export const DEFAULT_PAYLOAD_URL = 'http://localhost:4000';
export const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || DEFAULT_PAYLOAD_URL;
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
export const SESSION_DURATION_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const REVALIDATION_TIMEOUT_MS = 5000;
export const LOGIN_TIMEOUT_MS = 10000;
export const SESSION_RESTORE_TIMEOUT_MS = 8000;

// Hydrate fetches the user fresh from the database first so role changes
// (e.g. writer -> editor promotion) apply without a re-login.
export const SESSION_HYDRATE_REQUESTS = [
  { endpoint: '/api/users/me', method: 'GET' },
  { endpoint: '/api/users/refresh-token', method: 'POST' },
] as const;

// Renewal prioritizes extending the session before falling back to /me.
export const SESSION_RENEW_REQUESTS = [
  { endpoint: '/api/users/refresh-token', method: 'POST' },
  { endpoint: '/api/users/me', method: 'GET' },
] as const;

export const LOGOUT_ENDPOINTS = [
  { endpoint: '/api/users/logout', method: 'POST' },
] as const;
