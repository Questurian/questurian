/**
 * Hook to fetch pipeline checklist data
 * Provides real-time status of Payload Sync, Reviews, and JSON Export pipelines
 */

import { useEffect, useState, useCallback } from 'react';
import type {
  PayloadSyncChecklist,
  ReviewsChecklist,
  JsonExportChecklist,
} from '@shared/types/location';

interface UsePipelineChecklistsOptions {
  locationId: number | null;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds, default 5000
}

interface UsePipelineChecklistsResult {
  payloadSync: PayloadSyncChecklist | null;
  reviews: ReviewsChecklist | null;
  jsonExport: JsonExportChecklist | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const DEFAULT_REFRESH_INTERVAL = 5000; // 5 seconds

export function usePipelineChecklists({
  locationId,
  autoRefresh = true,
  refreshInterval = DEFAULT_REFRESH_INTERVAL,
}: UsePipelineChecklistsOptions): UsePipelineChecklistsResult {
  const [payloadSync, setPayloadSync] = useState<PayloadSyncChecklist | null>(null);
  const [reviews, setReviews] = useState<ReviewsChecklist | null>(null);
  const [jsonExport, setJsonExport] = useState<JsonExportChecklist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchChecklists = useCallback(async () => {
    if (!locationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/locations/${locationId}/pipelines/status`);

      if (!response.ok) {
        throw new Error(`Failed to fetch pipeline checklists: ${response.statusText}`);
      }

      const result = await response.json();
      const { data } = result;

      setPayloadSync(data.payload_sync);
      setReviews(data.reviews);
      setJsonExport(data.json_export);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('Error fetching pipeline checklists:', err);
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !locationId) return;

    // Fetch immediately on mount
    fetchChecklists();

    // Set up interval
    const interval = setInterval(fetchChecklists, refreshInterval);

    return () => clearInterval(interval);
  }, [locationId, autoRefresh, refreshInterval, fetchChecklists]);

  return {
    payloadSync,
    reviews,
    jsonExport,
    isLoading,
    error,
    refresh: fetchChecklists,
  };
}

// Individual hooks for each checklist (for granular updates if needed)

export function usePayloadSyncChecklist(locationId: number | null) {
  const [checklist, setChecklist] = useState<PayloadSyncChecklist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!locationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await window.fetch(`/api/locations/${locationId}/payload-sync/checklist`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      const result = await response.json();
      setChecklist(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  return { checklist, isLoading, error, fetch: refetch };
}

export function useReviewsChecklist(locationId: number | null) {
  const [checklist, setChecklist] = useState<ReviewsChecklist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!locationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await window.fetch(`/api/locations/${locationId}/reviews/checklist`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      const result = await response.json();
      setChecklist(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  return { checklist, isLoading, error, fetch: refetch };
}

export function useJsonExportChecklist(locationId: number | null) {
  const [checklist, setChecklist] = useState<JsonExportChecklist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!locationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await window.fetch(`/api/locations/${locationId}/json-export/checklist`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      const result = await response.json();
      setChecklist(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  return { checklist, isLoading, error, fetch: refetch };
}
