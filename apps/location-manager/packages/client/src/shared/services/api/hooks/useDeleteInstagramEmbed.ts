import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";

interface UseDeleteInstagramEmbedOptions {
  locationId: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useDeleteInstagramEmbed(options: UseDeleteInstagramEmbedOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embedId: number) => locationsApi.deleteInstagramEmbed(embedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-detail", options.locationId] });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}
