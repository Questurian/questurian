/**
 * Location management API — re-exports domain-specific sub-APIs
 */

export { locationsCrudApi } from "./locations-crud.api";
export { locationsUploadsApi } from "./locations-uploads.api";
export { locationsReviewsApi } from "./locations-reviews.api";
export { locationsTripAdvisorApi } from "./locations-tripadvisor.api";
export { locationsMergedReviewsApi } from "./locations-merged-reviews.api";
export { locationsExportsApi } from "./locations-exports.api";
export { healthApi } from "./health.api";

import { locationsCrudApi } from "./locations-crud.api";
import { locationsUploadsApi } from "./locations-uploads.api";
import { locationsReviewsApi } from "./locations-reviews.api";
import { locationsTripAdvisorApi } from "./locations-tripadvisor.api";
import { locationsMergedReviewsApi } from "./locations-merged-reviews.api";
import { locationsExportsApi } from "./locations-exports.api";
import { healthApi } from "./health.api";

export const locationsApi = {
  ...locationsCrudApi,
  ...locationsUploadsApi,
  ...locationsReviewsApi,
  ...locationsTripAdvisorApi,
  ...locationsMergedReviewsApi,
  ...locationsExportsApi,
  ...healthApi,
} as const;
