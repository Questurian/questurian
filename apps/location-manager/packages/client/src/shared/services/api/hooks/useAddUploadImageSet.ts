import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import type { Upload } from "@client/shared/services/api/types";
import type { ImageVariantType } from "@questurian/lm-shared";

interface UseAddUploadImageSetOptions {
  onSuccess?: (data: Upload) => void;
  onError?: (error: Error) => void;
}

export function useAddUploadImageSet(
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
      variantFiles: { type: ImageVariantType; file: File }[];
      photographerCredit?: string;
      altText?: string;
    }) =>
      locationsApi.uploadImageSet(
        locationId,
        sourceFile,
        variantFiles,
        photographerCredit,
        setUploadProgress,
        altText
      ),
    onSuccess: (data) => {
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: ["location-detail", locationId] });
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
