import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { FetchReviewsRequest } from "../types";

export const REVIEWS_STATUS_QUERY_KEY = "reviews-status";

interface UseFetchReviewsOptions {
  locationId: number;
  onSuccess?: (data: { reviewCount: number; totalReviews: number; hasMore: boolean }) => void;
  onError?: (error: Error) => void;
}

export function useFetchReviews(options: UseFetchReviewsOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: FetchReviewsRequest) =>
      locationsApi.fetchReviews(options.locationId, params),
    onSuccess: (data) => {
      // Invalidate the reviews status query to refresh the status
      queryClient.invalidateQueries({
        queryKey: [REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      options.onSuccess?.({
        reviewCount: data.reviewCount,
        totalReviews: data.totalReviews,
        hasMore: data.hasMore,
      });
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
  });
}

interface UseReviewsStatusOptions {
  locationId: number;
  enabled?: boolean;
}

export function useReviewsStatus(options: UseReviewsStatusOptions) {
  return useQuery({
    queryKey: [REVIEWS_STATUS_QUERY_KEY, options.locationId],
    queryFn: () => locationsApi.getReviewsStatus(options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadReviews() {
  return {
    download: (locationId: number) => {
      const url = locationsApi.getReviewsDownloadUrl(locationId);
      window.open(url, "_blank");
    },
  };
}
