import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { FetchTripAdvisorPlaceResponse } from "../types";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_BY_ID_QUERY_KEY } from "./useLocationById";

const TRIPADVISOR_PLACE_STATUS_QUERY_KEY = "tripadvisor-place-status";

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
      // Refresh location data because TripAdvisor fetch merges fields into the location record.
      queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATION_BY_ID_QUERY_KEY(options.locationId) });
      queryClient.invalidateQueries({ queryKey: ["location-detail", options.locationId] });
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
