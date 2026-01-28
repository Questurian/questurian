import { useQuery } from "@tanstack/react-query";
import { hierarchyApi } from "../hierarchy.api";

export const APPROVED_TAXONOMY_QUERY_KEY = ["admin", "taxonomy", "approved"] as const;

/**
 * Hook to fetch approved taxonomy entries (flat list with actual locationKeys)
 */
export function useApprovedTaxonomy() {
  return useQuery({
    queryKey: APPROVED_TAXONOMY_QUERY_KEY,
    queryFn: () => hierarchyApi.getAllHierarchy(),
  });
}
