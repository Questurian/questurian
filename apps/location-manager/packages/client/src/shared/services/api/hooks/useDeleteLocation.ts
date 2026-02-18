import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import type { Category } from "../types";

export function useDeleteLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ category, id }: { category: Category; id: number }) =>
      locationsApi.deleteLocation(category, id),
    onSuccess: () => {
      // Invalidate and refetch locations after successful deletion
      queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
    },
  });
}

