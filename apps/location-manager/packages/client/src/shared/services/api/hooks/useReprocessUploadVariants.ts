import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import type { Category, Upload } from "../types";

interface UseReprocessUploadVariantsOptions {
  category: Category;
  locationId: number;
  onSuccess?: (data: Upload) => void;
  onError?: (error: Error) => void;
}

export function useReprocessUploadVariants(
  options: UseReprocessUploadVariantsOptions
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uploadId: number) => locationsApi.reprocessUploadVariants(uploadId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: LOCATION_DETAIL_QUERY_KEY(options.category, options.locationId),
      });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}
