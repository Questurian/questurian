import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { payloadApi } from "@client/shared/services/api/payload.api";
import { isReadyForPayloadBulkSync } from "@client/features/admin/utils/payload-sync-filter-utils";
import type { LocationWithSyncStatus } from "./usePayloadSyncFilters";

type ShowToast = (message: string, position: { x: number; y: number }) => void;

export function useBulkPayloadSync({
  filteredData,
  hasActiveFilters,
  showToast,
}: {
  filteredData: LocationWithSyncStatus[];
  hasActiveFilters: boolean;
  showToast: ShowToast;
}) {
  const queryClient = useQueryClient();
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [bulkSyncProgress, setBulkSyncProgress] = useState<{ completed: number; total: number } | null>(null);

  const syncableFilteredCount = useMemo(
    () => filteredData.filter((item) => isReadyForPayloadBulkSync(item)).length,
    [filteredData]
  );

  const isBulkSyncing = bulkSyncProgress !== null;

  const syncAllButtonLabel = useMemo(() => {
    if (bulkSyncProgress) {
      return `Syncing ${bulkSyncProgress.completed}/${bulkSyncProgress.total}...`;
    }

    return hasActiveFilters
      ? `Sync Filtered (${syncableFilteredCount})`
      : `Sync All Ready (${syncableFilteredCount})`;
  }, [bulkSyncProgress, hasActiveFilters, syncableFilteredCount]);

  const handleSyncAll = async () => {
    const syncTargets = filteredData.filter((item) => isReadyForPayloadBulkSync(item));

    if (syncTargets.length === 0) {
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    setBulkSyncProgress({ completed: 0, total: syncTargets.length });

    try {
      for (let index = 0; index < syncTargets.length; index += 1) {
        const item = syncTargets[index]!;
        setSyncingId(item.locationId);

        const result = await payloadApi.syncLocation(item.locationId);
        if (result.status === "success") {
          successCount += 1;
        } else {
          failureCount += 1;
        }

        setBulkSyncProgress({ completed: index + 1, total: syncTargets.length });
      }

      showToast(
        failureCount > 0
          ? `Synced ${successCount} locations. ${failureCount} failed.`
          : `Synced ${successCount} locations.`,
        { x: window.innerWidth / 2, y: 100 }
      );
    } catch (syncError) {
      showToast(
        syncError instanceof Error ? syncError.message : "Failed to sync filtered locations.",
        { x: window.innerWidth / 2, y: 100 }
      );
    } finally {
      setSyncingId(null);
      setBulkSyncProgress(null);
      await queryClient.invalidateQueries({ queryKey: ["payload-sync-status"] });
    }
  };

  return {
    handleSyncAll,
    isBulkSyncing,
    setSyncingId,
    syncAllButtonLabel,
    syncableFilteredCount,
    syncingId,
  };
}
