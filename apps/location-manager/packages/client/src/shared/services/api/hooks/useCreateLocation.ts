import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { PENDING_TAXONOMY_QUERY_KEY } from "./usePendingTaxonomy";
import type { CreateMapsRequest } from "../types";

export function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMapsRequest) => locationsApi.createLocation(data),
    onSuccess: () => {
      // Invalidate and refetch locations after successful creation
      queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      // Invalidate pending taxonomy to show the red icon in navbar
      queryClient.invalidateQueries({ queryKey: PENDING_TAXONOMY_QUERY_KEY });
    },
  });
}
