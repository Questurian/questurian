import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import type { InstagramEmbed } from "@client/shared/services/api/types";

interface UseAddInstagramEmbedOptions {
  onSuccess?: (data: InstagramEmbed) => void;
  onError?: (error: Error) => void;
}

export function useAddInstagramEmbed(
  locationId: number,
  options?: UseAddInstagramEmbedOptions
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embedCode: string) =>
      locationsApi.addInstagramEmbed(locationId, { embedCode }),
    onSuccess: (data) => {
      // Invalidate location detail query to refresh embeds list
      queryClient.invalidateQueries({ queryKey: ["location-detail", locationId] });
      // Also invalidate locations list in case it affects overview
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}
