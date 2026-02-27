import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_BY_ID_QUERY_KEY } from "./useLocationById";
import { APPROVED_TAXONOMY_QUERY_KEY } from "./useApprovedTaxonomy";
import { PENDING_TAXONOMY_QUERY_KEY } from "./usePendingTaxonomy";
import type { Category, UpdateMapsRequest } from "../types";

export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ category, id, data }: { category: Category; id: number; data: UpdateMapsRequest }) =>
      locationsApi.updateLocation(category, id, data),
    onSuccess: async (data, { category, id }) => {
      // Update cached detail queries immediately
      queryClient.setQueryData(LOCATION_BY_ID_QUERY_KEY(category, id), data);
      queryClient.setQueryData(["location-detail", category, id], data);

      // Force-refresh all related queries so Home/detail views show latest values immediately after navigation.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY, refetchType: "all" }),
        queryClient.invalidateQueries({
          queryKey: LOCATIONS_BASIC_QUERY_KEY,
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: LOCATION_BY_ID_QUERY_KEY(category, id),
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: ["location-detail", category, id],
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: ["countries"],
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: APPROVED_TAXONOMY_QUERY_KEY,
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: PENDING_TAXONOMY_QUERY_KEY,
          refetchType: "all",
        }),
      ]);
    },
  });
}
