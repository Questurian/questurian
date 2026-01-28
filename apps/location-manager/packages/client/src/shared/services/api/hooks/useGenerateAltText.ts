import { useMutation } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

interface UseGenerateAltTextOptions {
  onSuccess?: (data: { altText: string }) => void;
  onError?: (error: Error) => void;
}

export function useGenerateAltText(options?: UseGenerateAltTextOptions) {
  const mutation = useMutation({
    mutationFn: async (imageFile: File): Promise<{ altText: string }> => {
      return locationsApi.generateAltText(imageFile);
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
