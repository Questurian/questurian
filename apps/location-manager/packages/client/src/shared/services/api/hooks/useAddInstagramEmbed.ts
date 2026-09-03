import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import { photoImportKeys } from "./usePhotoImport";
import type { Category, InstagramEmbed } from "@client/shared/services/api/types";
import { INSTAGRAM_API_QUOTA_QUERY_KEY } from "./useInstagramApiQuota";

interface UseAddInstagramEmbedOptions {
  onSuccess?: (data: InstagramEmbed) => void;
  onError?: (error: Error) => void;
}

export function useAddInstagramEmbed(
  category: Category | null,
  locationId: number,
  options?: UseAddInstagramEmbedOptions
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embedCode: string) => {
      if (!category) {
        throw new Error("Category is required to add Instagram embeds");
      }
      return locationsApi.addInstagramEmbed(category, locationId, { embedCode });
    },
    onSuccess: (data) => {
      if (!category) return;
      // Invalidate location detail query to refresh embeds list
      queryClient.invalidateQueries({ queryKey: LOCATION_DETAIL_QUERY_KEY(category, locationId) });
      // Also invalidate locations list in case it affects overview
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: photoImportKeys.sources(locationId) });
      queryClient.invalidateQueries({ queryKey: INSTAGRAM_API_QUOTA_QUERY_KEY });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}
