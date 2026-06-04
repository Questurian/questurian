import type { RefObject } from "react";
import { Button } from "@client/components/ui/button";
import { SkeletonTable } from "@client/shared/components/ui";
import { isPayloadSyncCategory } from "@client/features/admin/utils/payload-sync-filter-utils";
import {
  formatLabel,
  type LocationWithSyncStatus,
  type StatusFilter,
} from "@client/features/admin/hooks/usePayloadSyncFilters";
import type { Category } from "@client/shared/services/api/types";

interface ResetSyncStateMutation {
  isPending: boolean;
  mutate: (locationId: number) => void;
}

interface PayloadSyncTableProps {
  error: unknown;
  filteredData: LocationWithSyncStatus[];
  handleSyncLocation: (locationId: number, category: Category) => void;
  hasSyncErrors: boolean;
  isBulkSyncing: boolean;
  isLoading: boolean;
  resetSyncMutation: ResetSyncStateMutation;
  showLoadError: boolean;
  showSyncErrors: boolean;
  statusFilter: StatusFilter;
  syncingId: number | null;
  tableScrollRef: RefObject<HTMLDivElement | null>;
}

function getEmptyStateMessage(statusFilter: StatusFilter): string {
  switch (statusFilter) {
    case "ready":
      return "No locations ready for sync. Complete missing fields to prepare locations.";
    case "incomplete":
      return "No incomplete locations found.";
    case "synced":
      return "No synced locations found.";
    case "needs_resync":
      return "No locations need resync.";
    case "failed":
      return "No failed syncs found.";
    case "unsupported":
      return "No unsupported categories found.";
    default:
      return "No locations found for the selected filters.";
  }
}

function getSyncStatusBadge(item: LocationWithSyncStatus) {
  if (!isPayloadSyncCategory(item.category)) {
    return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Unsupported</span>;
  }

  if (!item.syncState) {
    if (item.isComplete) {
      return <span className="px-2 py-1 text-xs rounded bg-blue-500/15 text-blue-400">Ready to Sync</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Incomplete</span>;
  }

  if (item.syncState.sync_status === "success") {
    if (item.needsResync) {
      return <span className="px-2 py-1 text-xs rounded bg-orange-500/15 text-orange-400">Needs Resync</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-emerald-500/15 text-emerald-400">Synced</span>;
  }

  if (item.syncState.sync_status === "failed") {
    return <span className="px-2 py-1 text-xs rounded bg-red-500/15 text-red-400">Failed</span>;
  }

  if (item.syncState.sync_status === "pending") {
    return <span className="px-2 py-1 text-xs rounded bg-amber-500/15 text-amber-400">Pending</span>;
  }

  return null;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

export function PayloadSyncTable({
  error,
  filteredData,
  handleSyncLocation,
  hasSyncErrors,
  isBulkSyncing,
  isLoading,
  resetSyncMutation,
  showLoadError,
  showSyncErrors,
  statusFilter,
  syncingId,
  tableScrollRef,
}: PayloadSyncTableProps) {
  return (
    <>
      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 transition-opacity duration-500 ${showLoadError ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <p className="font-medium">Error loading sync status</p>
          <p className="text-sm">Please try again later.</p>
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : filteredData.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{getEmptyStateMessage(statusFilter)}</p>
        </div>
      ) : (
        <div ref={tableScrollRef} className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                {["ID", "Title", "Category", "Type", "Status", "Last Synced", "Payload Doc ID", "Actions"].map((heading) => (
                  <th
                    key={heading}
                    className={`px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider ${heading === "Status" ? "text-center" : heading === "Actions" ? "text-right" : "text-left"}`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredData.map((item) => (
                <tr key={item.locationId} className="hover:bg-accent">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{item.locationId}</td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    <div className="max-w-[20rem]">
                      <div>{item.title}</div>
                      {item.location && <div className="mt-1 text-xs font-normal text-muted-foreground">{item.location}</div>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{formatLabel(item.category)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{item.type ? formatLabel(item.type) : "-"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">{getSyncStatusBadge(item)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {item.syncState?.last_synced_at ? formatDate(item.syncState.last_synced_at) : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">
                    {item.syncState?.payload_doc_id || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {item.syncState && (
                        <Button
                          onClick={() => resetSyncMutation.mutate(item.locationId)}
                          disabled={resetSyncMutation.isPending || isBulkSyncing}
                          variant="ghost"
                          size="sm"
                        >
                          Reset
                        </Button>
                      )}
                      <Button
                        onClick={() => handleSyncLocation(item.locationId, item.category)}
                        disabled={
                          isBulkSyncing ||
                          !isPayloadSyncCategory(item.category) ||
                          syncingId === item.locationId ||
                          (item.synced && !item.needsResync)
                        }
                        variant="outline"
                        size="sm"
                      >
                        {!isPayloadSyncCategory(item.category)
                          ? "Unsupported"
                          : syncingId === item.locationId
                            ? "Syncing..."
                            : !item.synced
                              ? "Sync"
                              : item.needsResync
                                ? "Resync"
                                : "Synced"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasSyncErrors && (
        <div className={`mt-6 transition-opacity duration-500 ${showSyncErrors ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <h3 className="text-lg font-semibold mb-3">Error Details</h3>
          <div className="space-y-2">
            {filteredData
              .filter((item) => item.syncState?.error_message)
              .map((item) => (
                <div key={item.locationId} className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                  <p className="font-medium">Location #{item.locationId}: {item.title}</p>
                  <p className="text-sm">{item.syncState?.error_message}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
