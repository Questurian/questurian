/**
 * Location management API — combines domain-specific sub-APIs
 */

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
