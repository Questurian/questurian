import { useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

/**
 * Hook to clear the entire database and invalidate all React Query caches
 */
export function useClearDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => locationsApi.clearDatabase(),
    onSuccess: () => {
      // Clear ALL cached queries when database is cleared
      // This ensures no stale data remains after clearing the database
      queryClient.clear();

      console.log("✓ Database cleared and all query caches invalidated");
    },
  });
}
