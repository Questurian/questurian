/**
 * API services barrel export
 *
 * Usage:
 *   import { locationsApi, useLocationsBasic } from "@client/shared/services/api";
 */

// API namespaces
export { locationsApi } from "./locations.api";
export { hierarchyApi } from "./hierarchy.api";
export { toursApi } from "./tours.api";

// React Query hooks
export * from "./hooks";

// Types
export type * from "./types";
