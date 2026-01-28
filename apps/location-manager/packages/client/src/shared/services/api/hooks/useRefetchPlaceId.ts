import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";

interface UseRefetchPlaceIdOptions {
  locationId: number;
  onSuccess?: (placeId: string | null) => void;
  onError?: (error: Error) => void;
}

export function useRefetchPlaceId(options: UseRefetchPlaceIdOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => locationsApi.refetchPlaceId(options.locationId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["location-detail", options.locationId] });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      options?.onSuccess?.(data.placeId);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}
