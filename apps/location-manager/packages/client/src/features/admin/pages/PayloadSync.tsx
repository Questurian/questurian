import { useState, useMemo } from "react";
import { useSyncStatus, useSyncLocation, useSyncAll, usePayloadConnection } from "@client/shared/services/api/hooks/usePayloadSync";
import { useClearDatabase, useLocationsBasic } from "@client/shared/services/api/hooks";
import { useToast } from "@client/shared/hooks/useToast";
import { Button } from "@client/components/ui/button";
import { Breadcrumbs } from "@client/shared/components/layout";
import { SkeletonTable } from "@client/shared/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@client/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@client/components/ui/alert-dialog";
import type { Category } from "@client/shared/services/api/types";
import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";

export function PayloadSync() {
  const { data: statusData, isLoading, error, refetch: refetchSyncStatus } = useSyncStatus();
  const { data: locationsBasicData, isLoading: isLoadingLocationsBasic } = useLocationsBasic();
  const syncLocationMutation = useSyncLocation();
  const syncAllMutation = useSyncAll();
  const { data: connectionStatus, isLoading: isConnecting, refetch: testConnection } = usePayloadConnection();
  const clearDatabaseMutation = useClearDatabase();
  const { showToast } = useToast();

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "synced" | "ready" | "incomplete">("all");

  // Create a map of sync status by locationId for quick lookup
  const syncStatusMap = useMemo(() => {
    const map = new Map<number, SyncStatusResponse>();
    (statusData ?? []).forEach((item) => {
      map.set(item.locationId, item);
    });
    return map;
  }, [statusData]);

  // Show ALL locations with their sync status and completion status
  const allLocationsWithStatus = useMemo(() => {
    return (locationsBasicData?.locations ?? []).map((location) => {
      const syncStatus = syncStatusMap.get(location.id);
      return {
        locationId: location.id,
        title: location.title || location.name,
        category: location.category,
        isComplete: location.isComplete,
        synced: !!syncStatus && syncStatus.synced,
        needsResync: !!syncStatus && syncStatus.needsResync,
        syncState: syncStatus?.syncState,
      };
    });
  }, [locationsBasicData, syncStatusMap]);

  // Filter by status and category
  const filteredData = useMemo(() => {
    let filtered = allLocationsWithStatus;

    // Filter by status
    if (statusFilter === "synced") {
      filtered = filtered.filter(item => item.synced && !item.needsResync);
    } else if (statusFilter === "ready") {
      filtered = filtered.filter(item => !item.synced && item.isComplete);
    } else if (statusFilter === "incomplete") {
      filtered = filtered.filter(item => !item.isComplete);
    }

    // Filter by category
    if (categoryFilter !== "all") {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    return filtered;
  }, [allLocationsWithStatus, categoryFilter, statusFilter]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = (locationsBasicData?.locations ?? []).length;
    const synced = allLocationsWithStatus.filter(item => item.synced && !item.needsResync).length;
    const ready = allLocationsWithStatus.filter(item => !item.synced && item.isComplete).length;
    const incomplete = allLocationsWithStatus.filter(item => !item.isComplete).length;
    const needsResync = allLocationsWithStatus.filter(item => item.needsResync).length;
    const failed = allLocationsWithStatus.filter(item => item.syncState?.sync_status === "failed").length;

    return { total, synced, ready, incomplete, needsResync, failed };
  }, [locationsBasicData, allLocationsWithStatus]);

  const handleSyncLocation = async (locationId: number) => {
    setSyncingId(locationId);
    try {
      await syncLocationMutation.mutateAsync(locationId);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const category = categoryFilter !== "all" ? categoryFilter : undefined;
    await syncAllMutation.mutateAsync(category);
  };

  const handleClearDatabase = async () => {
    try {
      await clearDatabaseMutation.mutateAsync();
      // Refetch sync status to show updated (empty) data
      await refetchSyncStatus();
      showToast("Database cleared successfully", { x: window.innerWidth / 2, y: 100 });
    } catch (error) {
      showToast("Failed to clear database. Please try again.", { x: window.innerWidth / 2, y: 100 });
    }
  };

  const getSyncStatusBadge = (item: typeof allLocationsWithStatus[number]) => {
    if (!item.syncState) {
      if (item.isComplete) {
        return <span className="px-2 py-1 text-xs rounded bg-blue-500/15 text-blue-400">Ready to Sync</span>;
      }
      return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Incomplete</span>;
    }

    if (item.syncState.sync_status === "success") {
      // Check if location needs resync (changed after last sync)
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
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Breadcrumbs items={[{ label: "Admin" }, { label: "Payload Sync" }]} />
      <div className="bg-card border border-border rounded-xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-[24px] font-bold mb-2 text-foreground">
              Payload CMS Sync
            </h2>
            <p className="text-muted-foreground">
              Sync location data from url-util to Payload CMS
            </p>
          </div>

          {/* Clear Database Button with Confirmation Modal */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Clear Database
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will permanently delete all locations, Instagram embeds, uploads, and taxonomy data from the database.
                  This cannot be undone. All cached data will also be cleared.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearDatabase}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={clearDatabaseMutation.isPending}
                >
                  {clearDatabaseMutation.isPending ? "Clearing..." : "Yes, clear database"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Connection Status */}
        <div className="mb-6">
          {isConnecting ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-400">🟡 Connecting to Payload...</span>
              </div>
            </div>
          ) : connectionStatus?.connected ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">🟢 Connected to Payload CMS</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => testConnection()}>
                Test Again
              </Button>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-red-400 font-medium">🔴 Not Connected</span>
                <Button variant="outline" size="sm" onClick={() => testConnection()}>
                  Retry Connection
                </Button>
              </div>
              {connectionStatus?.error && (
                <p className="text-sm text-red-400 mt-2">{connectionStatus.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          <div className="bg-muted/50 border border-border p-4 rounded">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded">
            <div className="text-2xl font-bold text-emerald-400">{stats.synced}</div>
            <div className="text-sm text-emerald-400/80">Synced</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded">
            <div className="text-2xl font-bold text-blue-400">{stats.ready}</div>
            <div className="text-sm text-blue-400/80">Ready to Sync</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded">
            <div className="text-2xl font-bold text-amber-400">{stats.incomplete}</div>
            <div className="text-sm text-amber-400/80">Incomplete</div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded">
            <div className="text-2xl font-bold text-orange-400">{stats.needsResync}</div>
            <div className="text-sm text-orange-400/80">Needs Resync</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded">
            <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
            <div className="text-sm text-red-400/80">Failed</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "synced" | "ready" | "incomplete")}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="synced">✅ Synced</SelectItem>
                <SelectItem value="ready">🚀 Ready for Sync (Complete Fields)</SelectItem>
                <SelectItem value="incomplete">⚠️ Incomplete (Missing Fields)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Category</label>
            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as Category | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="dining">Dining</SelectItem>
                <SelectItem value="accommodations">Accommodations</SelectItem>
                <SelectItem value="attractions">Attractions</SelectItem>
                <SelectItem value="nightlife">Nightlife</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleSyncAll}
              disabled={syncAllMutation.isPending || filteredData.length === 0}
              className="w-full"
            >
              {syncAllMutation.isPending ? "Syncing..." : "Sync All"}
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            <p className="font-medium">Error loading sync status</p>
            <p className="text-sm">Please try again later.</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading || isLoadingLocationsBasic ? (
          <SkeletonTable rows={8} cols={7} />
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {statusFilter === "ready"
                ? "No locations ready for sync. Complete missing fields to prepare locations."
                : statusFilter === "incomplete"
                  ? "No incomplete locations found."
                  : statusFilter === "synced"
                    ? "No synced locations found."
                    : "No locations found for the selected filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Last Synced
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Payload Doc ID
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {filteredData.map((item) => (
                  <tr key={item.locationId} className="hover:bg-accent">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {item.locationId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                      {item.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                      {item.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getSyncStatusBadge(item)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {item.syncState?.last_synced_at
                        ? formatDate(item.syncState.last_synced_at)
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">
                      {item.syncState?.payload_doc_id || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Button
                        onClick={() => handleSyncLocation(item.locationId)}
                        disabled={syncingId === item.locationId || (item.synced && !item.needsResync)}
                        variant="outline"
                        size="sm"
                      >
                        {syncingId === item.locationId
                          ? "Syncing..."
                          : !item.synced
                            ? "Sync"
                            : item.needsResync
                              ? "Resync"
                              : "Synced"
                        }
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error messages for failed syncs */}
        {filteredData.some(item => item.syncState?.error_message) && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Error Details</h3>
            <div className="space-y-2">
              {filteredData
                .filter(item => item.syncState?.error_message)
                .map(item => (
                  <div key={item.locationId} className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
                    <p className="font-medium">Location #{item.locationId}: {item.title}</p>
                    <p className="text-sm">{item.syncState?.error_message}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
