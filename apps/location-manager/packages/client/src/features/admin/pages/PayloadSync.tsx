import { useState, useEffect, useRef } from "react";
import { useSyncStatus, useSyncLocation, usePayloadConnection, useResetSyncState } from "@client/shared/services/api/hooks/usePayloadSync";
import { useLocationsBasic } from "@client/shared/services/api/hooks";
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
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ListFilter,
  RefreshCw,
  Rocket,
  XCircle,
} from "lucide-react";
import type { Category } from "@client/shared/services/api/types";
import { isPayloadSyncCategory } from "@client/features/admin/utils/payload-sync-filter-utils";
import { useBulkPayloadSync } from "@client/features/admin/hooks/useBulkPayloadSync";
import {
  formatLabel,
  UNSPECIFIED_CITY_FILTER,
  UNSPECIFIED_COUNTRY_FILTER,
  UNSPECIFIED_NEIGHBORHOOD_FILTER,
  UNSPECIFIED_TYPE_FILTER,
  usePayloadSyncFilters,
  type CityFilter,
  type CountryFilter,
  type LocationTypeFilter,
  type LocationWithSyncStatus,
  type NeighborhoodFilter,
  type StatusFilter,
} from "@client/features/admin/hooks/usePayloadSyncFilters";

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

export function PayloadSync() {
  const { data: statusData, isLoading, error } = useSyncStatus();
  const { data: locationsBasicData, isLoading: isLoadingLocationsBasic } = useLocationsBasic();
  const syncLocationMutation = useSyncLocation();
  const { data: connectionStatus, isLoading: isConnecting, refetch: testConnection } = usePayloadConnection();
  const resetSyncMutation = useResetSyncState();
  const { showToast } = useToast();
  const {
    activeLocationScopeLabel,
    categoryFilter,
    cityFilter,
    cityOptions,
    clearFilters,
    countryFilter,
    countryOptions,
    filteredData,
    hasActiveFilters,
    hasSyncErrors,
    isCityFilterEnabled,
    isNeighborhoodFilterEnabled,
    locationTypeFilter,
    locationTypeOptions,
    neighborhoodFilter,
    neighborhoodOptions,
    setCategoryFilter,
    setCityFilter,
    setCountryFilter,
    setLocationTypeFilter,
    setNeighborhoodFilter,
    setStatusFilter,
    stats,
    statusFilter,
    toggleStatusFilter,
  } = usePayloadSyncFilters(statusData, locationsBasicData);
  const {
    handleSyncAll,
    isBulkSyncing,
    setSyncingId,
    syncAllButtonLabel,
    syncableFilteredCount,
    syncingId,
  } = useBulkPayloadSync({ filteredData, hasActiveFilters, showToast });

  const [showLoadError, setShowLoadError] = useState(false);
  const [showSyncErrors, setShowSyncErrors] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (error) {
      setShowLoadError(true);
      const t = setTimeout(() => setShowLoadError(false), 2000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (hasSyncErrors) {
      setShowSyncErrors(true);
      const t = setTimeout(() => setShowSyncErrors(false), 2000);
      return () => clearTimeout(t);
    }
  }, [hasSyncErrors]);

  useEffect(() => {
    if (isLoading || isLoadingLocationsBasic || filteredData.length === 0) {
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
  }, [filteredData, isLoading, isLoadingLocationsBasic]);

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

  const getSyncStatusBadge = (item: LocationWithSyncStatus) => {
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

          {/* Header action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={isBulkSyncing || syncableFilteredCount === 0}
            >
              {syncAllButtonLabel}
            </Button>

            {/* Reset Sync State Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Reset Sync State
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all sync state?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p className="font-semibold text-destructive">Only use this after wiping the Payload CMS database.</p>
                      <p>This deletes all stored Payload document IDs and clears all location references locally. On next sync, every location will be created as a new document in Payload.</p>
                      <p>If synced documents still exist in Payload, this will create duplicates — there is no undo.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await resetSyncMutation.mutateAsync(undefined);
                      showToast("Sync state reset successfully", { x: window.innerWidth / 2, y: 100 });
                    }}
                    disabled={resetSyncMutation.isPending}
                  >
                    {resetSyncMutation.isPending ? "Resetting..." : "Yes, reset sync state"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => testConnection()}
                aria-label="Test Payload connection again"
                title="Test Payload connection again"
                className="h-8 w-8 text-emerald-300 hover:text-emerald-200"
              >
                <RefreshCw className="h-4 w-4" />
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
        <div className="grid grid-cols-2 xl:grid-cols-7 gap-4 mb-6">
          <button
            type="button"
            onClick={() => toggleStatusFilter("all")}
            className={`bg-muted/50 border border-border p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "all" ? "ring-2 ring-foreground/25" : "hover:bg-muted"}`}
            aria-pressed={statusFilter === "all"}
          >
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("synced")}
            className={`bg-emerald-500/10 border border-emerald-500/20 p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "synced" ? "ring-2 ring-emerald-400/60" : "hover:bg-emerald-500/20"}`}
            aria-pressed={statusFilter === "synced"}
          >
            <div className="text-2xl font-bold text-emerald-400">{stats.synced}</div>
            <div className="text-sm text-emerald-400/80">Synced</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("ready")}
            className={`bg-blue-500/10 border border-blue-500/20 p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "ready" ? "ring-2 ring-blue-400/60" : "hover:bg-blue-500/20"}`}
            aria-pressed={statusFilter === "ready"}
          >
            <div className="text-2xl font-bold text-blue-400">{stats.ready}</div>
            <div className="text-sm text-blue-400/80">Ready to Sync</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("incomplete")}
            className={`bg-amber-500/10 border border-amber-500/20 p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "incomplete" ? "ring-2 ring-amber-400/60" : "hover:bg-amber-500/20"}`}
            aria-pressed={statusFilter === "incomplete"}
          >
            <div className="text-2xl font-bold text-amber-400">{stats.incomplete}</div>
            <div className="text-sm text-amber-400/80">Incomplete</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("needs_resync")}
            className={`bg-orange-500/10 border border-orange-500/20 p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "needs_resync" ? "ring-2 ring-orange-400/60" : "hover:bg-orange-500/20"}`}
            aria-pressed={statusFilter === "needs_resync"}
          >
            <div className="text-2xl font-bold text-orange-400">{stats.needsResync}</div>
            <div className="text-sm text-orange-400/80">Needs Resync</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("failed")}
            className={`bg-red-500/10 border border-red-500/20 p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "failed" ? "ring-2 ring-red-400/60" : "hover:bg-red-500/20"}`}
            aria-pressed={statusFilter === "failed"}
          >
            <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
            <div className="text-sm text-red-400/80">Failed</div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter("unsupported")}
            className={`bg-muted/50 border border-border p-4 rounded text-left transition hover:cursor-pointer ${statusFilter === "unsupported" ? "ring-2 ring-foreground/25" : "hover:bg-muted"}`}
            aria-pressed={statusFilter === "unsupported"}
          >
            <div className="text-2xl font-bold text-muted-foreground">{stats.unsupported}</div>
            <div className="text-sm text-muted-foreground">Unsupported</div>
          </button>
        </div>

        {/* Controls */}
        <div className="mb-6 space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-[220px]">
              <label className="block text-sm font-medium mb-1">Status</label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="inline-flex items-center gap-2">
                      <ListFilter className="h-4 w-4" />
                      All Statuses
                    </span>
                  </SelectItem>
                  <SelectItem value="synced">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Synced
                    </span>
                  </SelectItem>
                  <SelectItem value="ready">
                    <span className="inline-flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-blue-500" />
                      Ready for Sync (Complete Fields)
                    </span>
                  </SelectItem>
                  <SelectItem value="incomplete">
                    <span className="inline-flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Incomplete (Missing Fields)
                    </span>
                  </SelectItem>
                  <SelectItem value="needs_resync">
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-orange-500" />
                      Needs Resync
                    </span>
                  </SelectItem>
                  <SelectItem value="failed">
                    <span className="inline-flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Failed
                    </span>
                  </SelectItem>
                  <SelectItem value="unsupported">
                    <span className="inline-flex items-center gap-2">
                      <Ban className="h-4 w-4 text-muted-foreground" />
                      Unsupported Category
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[220px]">
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
                  <SelectItem value="key_locations">Key Locations</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[220px]">
              <label className="block text-sm font-medium mb-1">Location Type</label>
              <Select value={locationTypeFilter} onValueChange={(value) => setLocationTypeFilter(value as LocationTypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by location type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {locationTypeOptions.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </SelectItem>
                  ))}
                  {locationTypeOptions.unspecifiedCount > 0 && (
                    <SelectItem value={UNSPECIFIED_TYPE_FILTER}>
                      Unspecified ({locationTypeOptions.unspecifiedCount})
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Location Scope</p>
                <p className="text-sm text-muted-foreground">
                  Drill from country to city to neighborhood.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {filteredData.length} in view
                </span>
                <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs text-foreground">
                  {activeLocationScopeLabel}
                </span>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="min-w-[220px]">
                <label className="block text-sm font-medium mb-1">Country</label>
                <Select
                  value={countryFilter}
                  onValueChange={(value) => {
                    setCountryFilter(value as CountryFilter);
                    setCityFilter("all");
                    setNeighborhoodFilter("all");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {countryOptions.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.count})
                      </SelectItem>
                    ))}
                    {countryOptions.unspecifiedCount > 0 && (
                      <SelectItem value={UNSPECIFIED_COUNTRY_FILTER}>
                        Unspecified ({countryOptions.unspecifiedCount})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <label className="block text-sm font-medium mb-1">City</label>
                <Select
                  value={cityFilter}
                  onValueChange={(value) => {
                    setCityFilter(value as CityFilter);
                    setNeighborhoodFilter("all");
                  }}
                  disabled={!isCityFilterEnabled || (cityOptions.options.length === 0 && cityOptions.unspecifiedCount === 0)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!isCityFilterEnabled ? "Select country first" : "All cities"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {cityOptions.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.count})
                      </SelectItem>
                    ))}
                    {cityOptions.unspecifiedCount > 0 && (
                      <SelectItem value={UNSPECIFIED_CITY_FILTER}>
                        Unspecified ({cityOptions.unspecifiedCount})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <label className="block text-sm font-medium mb-1">Neighborhood</label>
                <Select
                  value={neighborhoodFilter}
                  onValueChange={(value) => setNeighborhoodFilter(value as NeighborhoodFilter)}
                  disabled={
                    !isNeighborhoodFilterEnabled ||
                    (neighborhoodOptions.options.length === 0 && neighborhoodOptions.unspecifiedCount === 0)
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={!isNeighborhoodFilterEnabled ? "Select city first" : "All neighborhoods"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Neighborhoods</SelectItem>
                    {neighborhoodOptions.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.count})
                      </SelectItem>
                    ))}
                    {neighborhoodOptions.unspecifiedCount > 0 && (
                      <SelectItem value={UNSPECIFIED_NEIGHBORHOOD_FILTER}>
                        Unspecified ({neighborhoodOptions.unspecifiedCount})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className={`bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 transition-opacity duration-500 ${showLoadError ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <p className="font-medium">Error loading sync status</p>
            <p className="text-sm">Please try again later.</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading || isLoadingLocationsBasic ? (
          <SkeletonTable rows={8} cols={8} />
        ) : filteredData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {getEmptyStateMessage(statusFilter)}
            </p>
          </div>
        ) : (
          <div ref={tableScrollRef} className="overflow-x-auto">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
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
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      <div className="max-w-[20rem]">
                        <div>{item.title}</div>
                        {item.location && (
                          <div className="mt-1 text-xs font-normal text-muted-foreground">
                            {item.location}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatLabel(item.category)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {item.type ? formatLabel(item.type) : "-"}
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
                                : "Synced"
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error messages for failed syncs */}
        {hasSyncErrors && (
          <div className={`mt-6 transition-opacity duration-500 ${showSyncErrors ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
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
