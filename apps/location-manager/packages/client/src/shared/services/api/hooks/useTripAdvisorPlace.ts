import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { FetchTripAdvisorPlaceResponse } from "../types";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_BY_ID_QUERY_KEY } from "./useLocationById";
import type { Category } from "../types";

const TRIPADVISOR_PLACE_STATUS_QUERY_KEY = "tripadvisor-place-status";

interface UseFetchTripAdvisorPlaceOptions {
  category: Category;
  locationId: number;
  onSuccess?: (data: FetchTripAdvisorPlaceResponse["data"]) => void;
  onError?: (error: Error) => void;
}

export function useFetchTripAdvisorPlace(options: UseFetchTripAdvisorPlaceOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => locationsApi.fetchTripAdvisorPlace(options.category, options.locationId),
    onSuccess: (data) => {
      // Invalidate the place status query to refresh the status
      queryClient.invalidateQueries({
        queryKey: [TRIPADVISOR_PLACE_STATUS_QUERY_KEY, options.category, options.locationId],
      });
      // Refresh location data because TripAdvisor fetch merges fields into the location record.
      queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATION_BY_ID_QUERY_KEY(options.category, options.locationId) });
      queryClient.invalidateQueries({ queryKey: ["location-detail", options.category, options.locationId] });
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error as Error);
    },
  });
}

interface UseTripAdvisorPlaceStatusOptions {
  category: Category;
  locationId: number;
  enabled?: boolean;
}

export function useTripAdvisorPlaceStatus(options: UseTripAdvisorPlaceStatusOptions) {
  return useQuery({
    queryKey: [TRIPADVISOR_PLACE_STATUS_QUERY_KEY, options.category, options.locationId],
    queryFn: () => locationsApi.getTripAdvisorPlaceStatus(options.category, options.locationId),
    enabled: options.enabled ?? true,
  });
}

export function useDownloadTripAdvisorPlace() {
  return {
    download: (category: Category, locationId: number) => {
      const url = locationsApi.getTripAdvisorPlaceDownloadUrl(category, locationId);
      window.open(url, "_blank");
    },
  };
}
