/**
 * API services barrel export
 *
 * Usage:
 *   import { locationsApi, useLocations } from "@client/shared/services/api";
 */

// Core client utilities
export { ApiError, unwrapEntry } from "./client";
export type { ApiResponse } from "./client";
export { apiGet, apiPost, apiPatch, apiPostFormData } from "./client";

// Configuration
export { API_BASE_URL, API_ENDPOINTS } from "./config";

// API namespaces
export { locationsApi } from "./locations.api";
export { hierarchyApi } from "./hierarchy.api";
export { filesApi } from "./files.api";

// React Query hooks
export * from "./hooks";

// Types
export type * from "./types";
