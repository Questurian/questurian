import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_BY_ID_QUERY_KEY } from "./useLocationById";
import type { UpdateMapsRequest } from "../types";

export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateMapsRequest }) =>
      locationsApi.updateLocation(id, data),
    onSuccess: (data, { id }) => {
      // Update cached detail queries immediately
      queryClient.setQueryData(LOCATION_BY_ID_QUERY_KEY(id), data);
      queryClient.setQueryData(["location-detail", id], data);

      // Invalidate and refetch locations and the specific location
      queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATION_BY_ID_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ["location-detail", id] });
    },
  });
}
