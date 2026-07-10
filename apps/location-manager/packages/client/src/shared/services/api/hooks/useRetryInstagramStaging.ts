import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import { photoImportKeys } from "./usePhotoImport";
import type { Category } from "../types";

export function useRetryInstagramStaging(category: Category, locationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (embedId: number) => locationsApi.retryInstagramStaging(embedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOCATION_DETAIL_QUERY_KEY(category, locationId) });
      queryClient.invalidateQueries({ queryKey: photoImportKeys.sources(locationId) });
    },
  });
}
