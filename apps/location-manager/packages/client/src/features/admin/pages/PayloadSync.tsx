import { useEffect, useRef, useState } from "react";
import { useSyncStatus, useSyncLocation, usePayloadConnection, useResetSyncState } from "@client/shared/services/api/hooks/usePayloadSync";
import { useLocationsBasic } from "@client/shared/services/api/hooks";
import { useToast } from "@client/shared/hooks/useToast";
import { Breadcrumbs } from "@client/shared/components/layout";
import type { Category } from "@client/shared/services/api/types";
import { isPayloadSyncCategory } from "@client/features/admin/utils/payload-sync-filter-utils";
import { useBulkPayloadSync } from "@client/features/admin/hooks/useBulkPayloadSync";
import { usePayloadSyncFilters } from "@client/features/admin/hooks/usePayloadSyncFilters";
import { PayloadSyncConnectionStatus } from "@client/features/admin/components/payload-sync/PayloadSyncConnectionStatus";
import { PayloadSyncFilters } from "@client/features/admin/components/payload-sync/PayloadSyncFilters";
import { PayloadSyncHeader } from "@client/features/admin/components/payload-sync/PayloadSyncHeader";
import { PayloadSyncStats } from "@client/features/admin/components/payload-sync/PayloadSyncStats";
import { PayloadSyncTable } from "@client/features/admin/components/payload-sync/PayloadSyncTable";

export function PayloadSync() {
  const { data: statusData, isLoading, error } = useSyncStatus();
  const { data: locationsBasicData, isLoading: isLoadingLocationsBasic } = useLocationsBasic();
  const syncLocationMutation = useSyncLocation();
  const { data: connectionStatus, isLoading: isConnecting, refetch: testConnection } = usePayloadConnection();
  const resetSyncMutation = useResetSyncState();
  const { showToast } = useToast();
  const filterState = usePayloadSyncFilters(statusData, locationsBasicData);
  const {
    handleSyncAll,
    isBulkSyncing,
    setSyncingId,
    syncAllButtonLabel,
    syncableFilteredCount,
    syncingId,
  } = useBulkPayloadSync({
    filteredData: filterState.filteredData,
    hasActiveFilters: filterState.hasActiveFilters,
    showToast,
  });

  const [showLoadError, setShowLoadError] = useState(false);
  const [showSyncErrors, setShowSyncErrors] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const isTableLoading = isLoading || isLoadingLocationsBasic;

  useEffect(() => {
    if (error) {
      setShowLoadError(true);
      const t = setTimeout(() => setShowLoadError(false), 2000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (filterState.hasSyncErrors) {
      setShowSyncErrors(true);
      const t = setTimeout(() => setShowSyncErrors(false), 2000);
      return () => clearTimeout(t);
    }
  }, [filterState.hasSyncErrors]);

  useEffect(() => {
    if (isTableLoading || filterState.filteredData.length === 0) {
      return;
    }

    const scrollContainer = tableScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [filterState.filteredData, isTableLoading]);

  const handleSyncLocation = async (locationId: number, category: Category) => {
    if (!isPayloadSyncCategory(category)) {
      showToast("Payload sync does not support this category.", { x: window.innerWidth / 2, y: 100 });
      return;
    }

    setSyncingId(locationId);
    try {
      await syncLocationMutation.mutateAsync(locationId);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Breadcrumbs items={[{ label: "Admin" }, { label: "Payload Sync" }]} />
      <div className="bg-card border border-border rounded-xl p-6">
        <PayloadSyncHeader
          handleSyncAll={handleSyncAll}
          isBulkSyncing={isBulkSyncing}
          isResettingSyncState={resetSyncMutation.isPending}
          resetAllSyncState={() => resetSyncMutation.mutateAsync(undefined)}
          showToast={showToast}
          syncAllButtonLabel={syncAllButtonLabel}
          syncableFilteredCount={syncableFilteredCount}
        />
        <PayloadSyncConnectionStatus
          connectionStatus={connectionStatus}
          isConnecting={isConnecting}
          testConnection={testConnection}
        />
        <PayloadSyncStats
          stats={filterState.stats}
          statusFilter={filterState.statusFilter}
          toggleStatusFilter={filterState.toggleStatusFilter}
        />
        <PayloadSyncFilters
          {...filterState}
          filteredCount={filterState.filteredData.length}
        />
        <PayloadSyncTable
          error={error}
          filteredData={filterState.filteredData}
          handleSyncLocation={handleSyncLocation}
          hasSyncErrors={filterState.hasSyncErrors}
          isBulkSyncing={isBulkSyncing}
          isLoading={isTableLoading}
          resetSyncMutation={resetSyncMutation}
          showLoadError={showLoadError}
          showSyncErrors={showSyncErrors}
          statusFilter={filterState.statusFilter}
          syncingId={syncingId}
          tableScrollRef={tableScrollRef}
        />
      </div>
    </div>
  );
}
