import { useMutation } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

interface UseGenerateAltTextOptions {
  onSuccess?: (data: { altText: string }) => void;
  onError?: (error: Error) => void;
}

export function useGenerateAltText(options?: UseGenerateAltTextOptions) {
  const mutation = useMutation({
    mutationFn: async (input: File | { imageFile: File; uploadId: number }): Promise<{ altText: string }> => {
      if (input instanceof File) return locationsApi.generateAltText(input);
      return locationsApi.generateAltText(input.imageFile, input.uploadId);
    },
    onSuccess: (data) => {
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });

  return mutation;
}
