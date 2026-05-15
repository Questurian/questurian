import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import type { Category, Upload } from "@client/shared/services/api/types";
import type { ImageVariantUploadFile } from "@client/shared/types/location-media.types";

interface UseAddUploadImageSetOptions {
  onSuccess?: (data: Upload) => void;
  onError?: (error: Error) => void;
}

export function useAddUploadImageSet(
  category: Category | null,
  locationId: number,
  options?: UseAddUploadImageSetOptions
) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: ({
      sourceFile,
      variantFiles,
      photographerCredit,
      altText,
    }: {
      sourceFile: File;
      variantFiles: ImageVariantUploadFile[];
      photographerCredit: string;
      altText?: string;
    }) => {
      if (!category) {
        throw new Error("Category is required to upload image sets");
      }
      return locationsApi.uploadImageSet(
        category,
        locationId,
        sourceFile,
        variantFiles,
        photographerCredit,
        setUploadProgress,
        altText
      );
    },
    onSuccess: (data) => {
      if (!category) return;
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: LOCATION_DETAIL_QUERY_KEY(category, locationId) });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      setUploadProgress(0);
      options?.onError?.(error);
    },
  });

  return { ...mutation, uploadProgress };
}
