import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import type { Category, Upload } from "../types";
import type { ImageVariantType } from "@questurian/lm-shared";

interface UseReplaceUploadVariantsOptions {
  category: Category;
  locationId: number;
  onSuccess?: (data: Upload) => void;
  onError?: (error: Error) => void;
}

export function useReplaceUploadVariants(
  options: UseReplaceUploadVariantsOptions
) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: ({
      uploadId,
      sourceFile,
      variantFiles,
      altText,
    }: {
      uploadId: number;
      sourceFile: File;
      variantFiles: { type: ImageVariantType; file: File }[];
      altText?: string;
    }) =>
      locationsApi.replaceUploadVariants(
        uploadId,
        sourceFile,
        variantFiles,
        setUploadProgress,
        altText
      ),
    onSuccess: (data) => {
      setUploadProgress(0);
      queryClient.invalidateQueries({
        queryKey: LOCATION_DETAIL_QUERY_KEY(options.category, options.locationId),
      });
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
