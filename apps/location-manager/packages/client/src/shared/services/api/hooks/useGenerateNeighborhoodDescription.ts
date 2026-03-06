import { useMutation } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type {
  Category,
  NeighborhoodDescriptionGenerationResponse,
} from "../types";

interface UseGenerateNeighborhoodDescriptionOptions {
  category: Category | null;
  locationId: number | null;
  onSuccess?: (data: NeighborhoodDescriptionGenerationResponse) => void;
  onError?: (error: Error) => void;
}

export function useGenerateNeighborhoodDescription(
  options: UseGenerateNeighborhoodDescriptionOptions
) {
  const mutation = useMutation({
    mutationFn: async (): Promise<NeighborhoodDescriptionGenerationResponse> => {
      if (!options.category || !options.locationId) {
        throw new Error("Location context is required to generate neighborhood description.");
      }

      return locationsApi.generateNeighborhoodDescription(
        options.category,
        options.locationId
      );
    },
    onSuccess: (data) => {
      options.onSuccess?.(data);
    },
    onError: (error) => {
      options.onError?.(error);
    },
  });

  return mutation;
}
