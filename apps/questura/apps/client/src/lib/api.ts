/**
 * Shared API utilities for making authenticated requests to the backend.
 * Compatibility layer that re-exports domain-split API modules.
 */

export { APIError, isServiceUnavailableError } from './api/api-errors';
export { getBackendUrl, getApiHeaders } from './api/api-config';
export { apiRequest } from './api/api-client';
export { get, post, put, del } from './api/api-methods';
