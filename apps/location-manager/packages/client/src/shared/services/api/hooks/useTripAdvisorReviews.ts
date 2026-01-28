import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { FetchTripAdvisorReviewsRequest, TripAdvisorReviewsStatusResponse } from "../types";

export const TRIPADVISOR_REVIEWS_STATUS_QUERY_KEY = "tripadvisor-reviews-status";

interface UseFetchTripAdvisorReviewsOptions {
  locationId: number;
  onSuccess?: (data: {
    languages: { language: string; reviewCount: number }[];
    totalReviews: number;
    locationName: string | null;
    rating: number | null;
  }) => void;
  onError?: (error: Error) => void;
}

export function useFetchTripAdvisorReviews(options: UseFetchTripAdvisorReviewsOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: FetchTripAdvisorReviewsRequest) =>
      locationsApi.fetchTripAdvisorReviews(options.locationId, params),
    onSuccess: (data) => {
      // Invalidate the reviews status query to refresh the status
      queryClient.invalidateQueries({
        queryKey: [TRIPADVISOR_REVIEWS_STATUS_QUERY_KEY, options.locationId],
      });
      options.onSuccess?.({
        languages: data.languages,
        totalReviews: data.totalReviews,
        locationName: data.locationName,
        rating: data.rating,
      });
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
  });
}

interface UseTripAdvisorReviewsStatusOptions {
  locationId: number;
  enabled?: boolean;
}

export function useTripAdvisorReviewsStatus(options: UseTripAdvisorReviewsStatusOptions) {
  return useQuery({
    queryKey: [TRIPADVISOR_REVIEWS_STATUS_QUERY_KEY, options.locationId],
    queryFn: () => locationsApi.getTripAdvisorReviewsStatus(options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadTripAdvisorReviews() {
  return {
    download: (locationId: number, lang?: string) => {
      const url = locationsApi.getTripAdvisorReviewsDownloadUrl(locationId, lang);
      window.open(url, "_blank");
    },
  };
}
