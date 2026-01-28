import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { locationsApi } from "../locations.api";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import type { Upload } from "@client/shared/services/api/types";

interface UseAddUploadFilesOptions {
  onSuccess?: (data: Upload) => void;
  onError?: (error: Error) => void;
}

export function useAddUploadFiles(
  locationId: number,
  options?: UseAddUploadFilesOptions
) {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: ({ files, photographerCredit }: { files: File[]; photographerCredit?: string }) =>
      locationsApi.uploadFiles(locationId, files, photographerCredit, setUploadProgress),
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
