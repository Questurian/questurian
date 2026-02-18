import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { Category } from "../types";

export const MERGED_REVIEWS_STATUS_QUERY_KEY = "merged-reviews-status";
const MERGED_REVIEWS_REPORT_QUERY_KEY = "merged-reviews-report";

interface UseMergedReviewsStatusOptions {
  category: Category;
  locationId: number;
  enabled?: boolean;
}

export function useMergedReviewsStatus(options: UseMergedReviewsStatusOptions) {
  return useQuery({
    queryKey: [MERGED_REVIEWS_STATUS_QUERY_KEY, options.category, options.locationId],
    queryFn: () => locationsApi.getMergedReviewsStatus(options.category, options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadMergedReviews() {
  return {
    download: (category: Category, locationId: number) => {
      const url = locationsApi.getMergedReviewsDownloadUrl(category, locationId);
      window.open(url, "_blank");
    },
  };
}

interface UseMergedReviewsReportOptions {
  category: Category;
  locationId: number;
  enabled?: boolean;
}

export function useMergedReviewsReport(options: UseMergedReviewsReportOptions) {
  return useQuery({
    queryKey: [MERGED_REVIEWS_REPORT_QUERY_KEY, options.category, options.locationId],
    queryFn: () => locationsApi.getMergedReviewsReport(options.category, options.locationId),
    enabled: options.enabled ?? true,
  });
}
