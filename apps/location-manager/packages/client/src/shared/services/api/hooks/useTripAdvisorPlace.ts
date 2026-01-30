import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { FetchTripAdvisorPlaceResponse } from "../types";

export const TRIPADVISOR_PLACE_STATUS_QUERY_KEY = "tripadvisor-place-status";

interface UseFetchTripAdvisorPlaceOptions {
  locationId: number;
  onSuccess?: (data: FetchTripAdvisorPlaceResponse["data"]) => void;
  onError?: (error: Error) => void;
}

export function useFetchTripAdvisorPlace(options: UseFetchTripAdvisorPlaceOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => locationsApi.fetchTripAdvisorPlace(options.locationId),
    onSuccess: (data) => {
      // Invalidate the place status query to refresh the status
      queryClient.invalidateQueries({
        queryKey: [TRIPADVISOR_PLACE_STATUS_QUERY_KEY, options.locationId],
      });
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
  });
}

interface UseTripAdvisorPlaceStatusOptions {
  locationId: number;
  enabled?: boolean;
}

export function useTripAdvisorPlaceStatus(options: UseTripAdvisorPlaceStatusOptions) {
  return useQuery({
    queryKey: [TRIPADVISOR_PLACE_STATUS_QUERY_KEY, options.locationId],
    queryFn: () => locationsApi.getTripAdvisorPlaceStatus(options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadTripAdvisorPlace() {
  return {
    download: (locationId: number) => {
      const url = locationsApi.getTripAdvisorPlaceDownloadUrl(locationId);
      window.open(url, "_blank");
    },
  };
}
