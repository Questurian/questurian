import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

export const MERGED_REVIEWS_STATUS_QUERY_KEY = "merged-reviews-status";
const MERGED_REVIEWS_REPORT_QUERY_KEY = "merged-reviews-report";

interface UseMergedReviewsStatusOptions {
  locationId: number;
  enabled?: boolean;
}

export function useMergedReviewsStatus(options: UseMergedReviewsStatusOptions) {
  return useQuery({
    queryKey: [MERGED_REVIEWS_STATUS_QUERY_KEY, options.locationId],
    queryFn: () => locationsApi.getMergedReviewsStatus(options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadMergedReviews() {
  return {
    download: (locationId: number) => {
      const url = locationsApi.getMergedReviewsDownloadUrl(locationId);
      window.open(url, "_blank");
    },
  };
}

interface UseMergedReviewsReportOptions {
  locationId: number;
  enabled?: boolean;
}

export function useMergedReviewsReport(options: UseMergedReviewsReportOptions) {
  return useQuery({
    queryKey: [MERGED_REVIEWS_REPORT_QUERY_KEY, options.locationId],
    queryFn: () => locationsApi.getMergedReviewsReport(options.locationId),
    enabled: options.enabled ?? true,
  });
}
