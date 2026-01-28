import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { payloadApi } from "../payload.api";
import type { Category } from "../types";

export const PAYLOAD_SYNC_STATUS_QUERY_KEY = ["payload-sync-status"] as const;

/**
 * Query hook for getting sync status
 */
export function useSyncStatus(locationId?: number) {
  return useQuery({
    queryKey: locationId
      ? [...PAYLOAD_SYNC_STATUS_QUERY_KEY, locationId]
      : PAYLOAD_SYNC_STATUS_QUERY_KEY,
    queryFn: () => payloadApi.getSyncStatus(locationId),
  });
}

/**
 * Mutation hook for syncing a single location to Payload
 */
export function useSyncLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (locationId: number) => payloadApi.syncLocation(locationId),
    onSuccess: () => {
      // Invalidate sync status to show updated state
      queryClient.invalidateQueries({ queryKey: PAYLOAD_SYNC_STATUS_QUERY_KEY });
    },
  });
}

/**
 * Mutation hook for syncing all locations to Payload
 */
export function useSyncAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (category?: Category) => payloadApi.syncAll(category),
    onSuccess: () => {
      // Invalidate sync status to show updated state
      queryClient.invalidateQueries({ queryKey: PAYLOAD_SYNC_STATUS_QUERY_KEY });
    },
  });
}

/**
 * Query hook for testing Payload CMS connection
 */
export function usePayloadConnection() {
  return useQuery({
    queryKey: ["payload-connection"],
    queryFn: () => payloadApi.testConnection(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    retry: 1, // Only retry once on failure
  });
}
