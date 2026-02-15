import { updateLocationById } from "../core";
import type { PipelineResult } from "../../types/reviews-pipeline.types";
import { nowIso } from "../../utils/reviews-pipeline.utils";

export function updateLocationReviewStats(
  locationId: number,
  stats: PipelineResult["merged"]["stats"]
): boolean {
  return updateLocationById(locationId, {
    reviewsFetchedAt: nowIso(),
    reviewsCount: stats.totalReviews,
    reviewsGoogleCount: stats.googleReviews,
    reviewsTripadvisorCount: stats.tripadvisorReviews,
  });
}

