/**
 * Location management API — combines domain-specific sub-APIs
 */

import { locationsCrudApi } from "./locations-crud.api";
import { locationsAiApi } from "./locations-ai.api";
import { locationsUploadsApi } from "./locations-uploads.api";
import { locationsTripAdvisorApi } from "./locations-tripadvisor.api";
import { locationsExportsApi } from "./locations-exports.api";

export const locationsApi = {
  ...locationsAiApi,
  ...locationsCrudApi,
  ...locationsUploadsApi,
  ...locationsTripAdvisorApi,
  ...locationsExportsApi,
} as const;
