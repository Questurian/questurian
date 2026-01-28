import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { MergedReviewsStats, RejectsReportSummary, MergedReviewsReportData } from "../types";

export const MERGED_REVIEWS_STATUS_QUERY_KEY = "merged-reviews-status";
export const MERGED_REVIEWS_REPORT_QUERY_KEY = "merged-reviews-report";

interface UseTranslateAndMergeReviewsOptions {
  locationId: number;
  onSuccess?: (data: {
    message: string;
    filename: string;
    stats: MergedReviewsStats;
    rejectsReport: RejectsReportSummary | null;
  }) => void;
  onError?: (error: Error) => void;
}

export function useTranslateAndMergeReviews(options: UseTranslateAndMergeReviewsOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => locationsApi.translateAndMergeReviews(options.locationId),
    onSuccess: (data) => {
      // Invalidate the merged reviews status query to refresh the status
      queryClient.invalidateQueries({
        queryKey: [MERGED_REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
  });
}

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

export function useDownloadRejectsReport() {
  return {
    download: (locationId: number) => {
      const url = locationsApi.getRejectsReportDownloadUrl(locationId);
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
