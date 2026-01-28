/**
 * React Query hooks for taxonomy corrections
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { taxonomyAdminApi } from "../taxonomy-admin.api";
import type { TaxonomyCorrectionRequest } from "../types";
import { PENDING_TAXONOMY_QUERY_KEY } from "./usePendingTaxonomy";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";

/**
 * Query key for taxonomy corrections cache
 */
export const TAXONOMY_CORRECTIONS_QUERY_KEY = ["admin", "taxonomy", "corrections"] as const;

/**
 * Fetch all taxonomy correction rules
 */
export function useTaxonomyCorrections() {
  return useQuery({
    queryKey: TAXONOMY_CORRECTIONS_QUERY_KEY,
    queryFn: () => taxonomyAdminApi.getCorrections(),
  });
}

/**
 * Preview a taxonomy correction before creating it
 */
export function usePreviewTaxonomyCorrection() {
  return useMutation({
    mutationFn: (data: TaxonomyCorrectionRequest) =>
      taxonomyAdminApi.previewCorrection(data),
  });
}

/**
 * Create a new taxonomy correction rule and apply it retroactively
 */
export function useCreateTaxonomyCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaxonomyCorrectionRequest) =>
      taxonomyAdminApi.createCorrection(data),
    onSuccess: () => {
      // Invalidate corrections table
      queryClient.invalidateQueries({ queryKey: TAXONOMY_CORRECTIONS_QUERY_KEY });
      // Invalidate pending taxonomy (we updated them)
      queryClient.invalidateQueries({ queryKey: PENDING_TAXONOMY_QUERY_KEY });
      // Invalidate locations (we updated locationKeys)
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY });
    },
  });
}

/**
 * Delete a taxonomy correction rule
 */
export function useDeleteTaxonomyCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      taxonomyAdminApi.deleteCorrection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAXONOMY_CORRECTIONS_QUERY_KEY });
    },
  });
}
