import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncStatus, useSyncLocation, useSyncAll, usePayloadConnection, useResetSyncState } from "@client/shared/services/api/hooks/usePayloadSync";
import { useLocationsBasic } from "@client/shared/services/api/hooks";
import { payloadApi } from "@client/shared/services/api/payload.api";
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
import { formatLocationName } from "@questurian/lm-shared";
import type { Category, PayloadSyncCategory } from "@client/shared/services/api/types";
import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";
import {
  buildFacetOptions,
  extractPayloadSyncLocationScope,
  matchesFacetFilter,
} from "@client/features/admin/utils/payload-sync-filter-utils";

type StatusFilter = "all" | "synced" | "ready" | "incomplete" | "needs_resync" | "failed" | "unsupported";

const UNSPECIFIED_COUNTRY_FILTER = "__unspecified_country__";
const UNSPECIFIED_CITY_FILTER = "__unspecified_city__";
const UNSPECIFIED_NEIGHBORHOOD_FILTER = "__unspecified_neighborhood__";
const UNSPECIFIED_TYPE_FILTER = "__unspecified_type__";
type CountryFilter = "all" | typeof UNSPECIFIED_COUNTRY_FILTER | string;
type CityFilter = "all" | typeof UNSPECIFIED_CITY_FILTER | string;
type NeighborhoodFilter = "all" | typeof UNSPECIFIED_NEIGHBORHOOD_FILTER | string;
type LocationTypeFilter = "all" | typeof UNSPECIFIED_TYPE_FILTER | string;

interface LocationWithSyncStatus {
  locationId: number;
  title: string;
  location: string | null;
  locationKey: string | null;
  country: string | null;
  city: string | null;
  neighborhood: string | null;
  category: Category;
  type: string | null;
  isComplete: boolean;
  synced: boolean;
  needsResync: boolean;
  syncState?: SyncStatusResponse["syncState"];
}

function isPayloadSyncCategory(category: Category): category is PayloadSyncCategory {
  return category === "dining" ||
    category === "accommodations" ||
    category === "attractions" ||
    category === "nightlife" ||
    category === "key_locations";
}

function matchesStatusFilter(item: LocationWithSyncStatus, filter: StatusFilter): boolean {
  const supported = isPayloadSyncCategory(item.category);

  switch (filter) {
    case "all":
      return true;
    case "synced":
      return supported && item.synced && !item.needsResync;
    case "ready":
      return supported &&
        item.isComplete &&
        !item.synced &&
        item.syncState?.sync_status !== "failed" &&
        item.syncState?.sync_status !== "pending";
    case "incomplete":
      return !item.isComplete;
    case "needs_resync":
      return supported && item.needsResync;
    case "failed":
      return item.syncState?.sync_status === "failed";
    case "unsupported":
      return !supported;
    default:
      return true;
  }
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function matchesCountryFilter(country: string | null, filter: CountryFilter): boolean {
  return matchesFacetFilter(country, filter, UNSPECIFIED_COUNTRY_FILTER);
}

function matchesCityFilter(city: string | null, filter: CityFilter): boolean {
  return matchesFacetFilter(city, filter, UNSPECIFIED_CITY_FILTER);
}

function matchesNeighborhoodFilter(neighborhood: string | null, filter: NeighborhoodFilter): boolean {
  return matchesFacetFilter(neighborhood, filter, UNSPECIFIED_NEIGHBORHOOD_FILTER);
}

function formatActiveScopePart(value: string, unspecifiedValue: string, unspecifiedLabel: string): string {
  if (value === unspecifiedValue) {
    return unspecifiedLabel;
  }

  return formatLocationName(value);
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

export function PayloadSync() {
  const { data: statusData, isLoading, error } = useSyncStatus();
  const { data: locationsBasicData, isLoading: isLoadingLocationsBasic } = useLocationsBasic();
  const syncLocationMutation = useSyncLocation();
  const syncAllMutation = useSyncAll();
  const { data: connectionStatus, isLoading: isConnecting, refetch: testConnection } = usePayloadConnection();
  const resetSyncMutation = useResetSyncState();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [countryFilter, setCountryFilter] = useState<CountryFilter>("all");
  const [cityFilter, setCityFilter] = useState<CityFilter>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<NeighborhoodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState<LocationTypeFilter>("all");
  const [bulkSyncProgress, setBulkSyncProgress] = useState<{ completed: number; total: number } | null>(null);

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

  // Create a map of sync status by locationId for quick lookup
  const syncStatusMap = useMemo(() => {
    const map = new Map<number, SyncStatusResponse>();
    (statusData ?? []).forEach((item) => {
      map.set(item.locationId, item);
    });
    return map;
  }, [statusData]);

  // Show ALL locations with their sync status and completion status
  const allLocationsWithStatus = useMemo<LocationWithSyncStatus[]>(() => {
    return (locationsBasicData?.locations ?? []).map((location) => {
      const syncStatus = syncStatusMap.get(location.id);
      const locationScope = extractPayloadSyncLocationScope({
        location: location.location,
        locationKey: location.locationKey,
        country: location.country,
      });

      return {
        locationId: location.id,
        title: location.title || location.name,
        location: locationScope.location,
        locationKey: locationScope.locationKey,
        country: locationScope.country,
        city: locationScope.city,
        neighborhood: locationScope.neighborhood,
        category: location.category,
        type: location.type?.trim() || null,
        isComplete: location.isComplete,
        synced: !!syncStatus && syncStatus.synced,
        needsResync: !!syncStatus && syncStatus.needsResync,
        syncState: syncStatus?.syncState,
      };
    });
  }, [locationsBasicData, syncStatusMap]);

  const locationHierarchyBaseData = useMemo(() => {
    let filtered = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, statusFilter));

    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    if (locationTypeFilter !== "all") {
      if (locationTypeFilter === UNSPECIFIED_TYPE_FILTER) {
        filtered = filtered.filter((item) => !item.type);
      } else {
        filtered = filtered.filter((item) => item.type === locationTypeFilter);
      }
    }

    return filtered;
  }, [allLocationsWithStatus, categoryFilter, locationTypeFilter, statusFilter]);

  const countryOptions = useMemo(() => {
    return buildFacetOptions(
      locationHierarchyBaseData,
      (item) => item.country,
      (value) => formatLocationName(value)
    );
  }, [locationHierarchyBaseData]);

  useEffect(() => {
    if (countryFilter === "all") {
      return;
    }

    if (countryFilter === UNSPECIFIED_COUNTRY_FILTER) {
      if (countryOptions.unspecifiedCount === 0) {
        setCountryFilter("all");
      }
      return;
    }

    const stillExists = countryOptions.options.some((option) => option.value === countryFilter);
    if (!stillExists) {
      setCountryFilter("all");
    }
  }, [countryFilter, countryOptions]);

  const isCityFilterEnabled =
    countryFilter !== "all" && countryFilter !== UNSPECIFIED_COUNTRY_FILTER;

  const cityOptions = useMemo(() => {
    if (!isCityFilterEnabled) {
      return { options: [], unspecifiedCount: 0 };
    }

    return buildFacetOptions(
      locationHierarchyBaseData.filter((item) => matchesCountryFilter(item.country, countryFilter)),
      (item) => item.city,
      (value) => formatLocationName(value)
    );
  }, [countryFilter, isCityFilterEnabled, locationHierarchyBaseData]);

  useEffect(() => {
    if (!isCityFilterEnabled) {
      if (cityFilter !== "all") {
        setCityFilter("all");
      }
      if (neighborhoodFilter !== "all") {
        setNeighborhoodFilter("all");
      }
      return;
    }

    if (cityFilter === "all") {
      return;
    }

    if (cityFilter === UNSPECIFIED_CITY_FILTER) {
      if (cityOptions.unspecifiedCount === 0) {
        setCityFilter("all");
      }
      return;
    }

    const stillExists = cityOptions.options.some((option) => option.value === cityFilter);
    if (!stillExists) {
      setCityFilter("all");
    }
  }, [cityFilter, cityOptions, isCityFilterEnabled, neighborhoodFilter]);

  const isNeighborhoodFilterEnabled =
    isCityFilterEnabled && cityFilter !== "all" && cityFilter !== UNSPECIFIED_CITY_FILTER;

  const neighborhoodOptions = useMemo(() => {
    if (!isNeighborhoodFilterEnabled) {
      return { options: [], unspecifiedCount: 0 };
    }

    return buildFacetOptions(
      locationHierarchyBaseData
        .filter((item) => matchesCountryFilter(item.country, countryFilter))
        .filter((item) => matchesCityFilter(item.city, cityFilter)),
      (item) => item.neighborhood,
      (value) => formatLocationName(value)
    );
  }, [cityFilter, countryFilter, isNeighborhoodFilterEnabled, locationHierarchyBaseData]);

  useEffect(() => {
    if (!isNeighborhoodFilterEnabled) {
      if (neighborhoodFilter !== "all") {
        setNeighborhoodFilter("all");
      }
      return;
    }

    if (neighborhoodFilter === "all") {
      return;
    }

    if (neighborhoodFilter === UNSPECIFIED_NEIGHBORHOOD_FILTER) {
      if (neighborhoodOptions.unspecifiedCount === 0) {
        setNeighborhoodFilter("all");
      }
      return;
    }

    const stillExists = neighborhoodOptions.options.some((option) => option.value === neighborhoodFilter);
    if (!stillExists) {
      setNeighborhoodFilter("all");
    }
  }, [isNeighborhoodFilterEnabled, neighborhoodFilter, neighborhoodOptions]);

  const locationTypeBaseData = useMemo(() => {
    let filtered = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, statusFilter));

    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    filtered = filtered.filter((item) => matchesCountryFilter(item.country, countryFilter));
    filtered = filtered.filter((item) => matchesCityFilter(item.city, cityFilter));
    filtered = filtered.filter((item) => matchesNeighborhoodFilter(item.neighborhood, neighborhoodFilter));

    return filtered;
  }, [
    allLocationsWithStatus,
    categoryFilter,
    cityFilter,
    countryFilter,
    neighborhoodFilter,
    statusFilter,
  ]);

  const locationTypeOptions = useMemo(() => {
    return buildFacetOptions(
      locationTypeBaseData,
      (item) => item.type,
      (value) => formatLabel(value)
    );
  }, [locationTypeBaseData]);

  useEffect(() => {
    if (locationTypeFilter === "all") {
      return;
    }

    if (locationTypeFilter === UNSPECIFIED_TYPE_FILTER) {
      if (locationTypeOptions.unspecifiedCount === 0) {
        setLocationTypeFilter("all");
      }
      return;
    }

    const stillExists = locationTypeOptions.options.some((option) => option.value === locationTypeFilter);
    if (!stillExists) {
      setLocationTypeFilter("all");
    }
  }, [locationTypeFilter, locationTypeOptions]);

  // Filter by status, category, location scope, and location type
  const filteredData = useMemo(() => {
    let filtered = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, statusFilter));

    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    filtered = filtered.filter((item) => matchesCountryFilter(item.country, countryFilter));
    filtered = filtered.filter((item) => matchesCityFilter(item.city, cityFilter));
    filtered = filtered.filter((item) => matchesNeighborhoodFilter(item.neighborhood, neighborhoodFilter));

    if (locationTypeFilter !== "all") {
      if (locationTypeFilter === UNSPECIFIED_TYPE_FILTER) {
        filtered = filtered.filter((item) => !item.type);
      } else {
        filtered = filtered.filter((item) => item.type === locationTypeFilter);
      }
    }

    return filtered;
  }, [
    allLocationsWithStatus,
    categoryFilter,
    cityFilter,
    countryFilter,
    locationTypeFilter,
    neighborhoodFilter,
    statusFilter,
  ]);

  const hasSyncErrors = useMemo(
    () => filteredData.some((item) => item.syncState?.error_message),
    [filteredData]
  );

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

  // Calculate statistics
  const stats = useMemo(() => {
    const total = allLocationsWithStatus.length;
    const synced = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "synced")).length;
    const ready = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "ready")).length;
    const incomplete = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "incomplete")).length;
    const needsResync = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "needs_resync")).length;
    const failed = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "failed")).length;
    const unsupported = allLocationsWithStatus.filter((item) => matchesStatusFilter(item, "unsupported")).length;

    return { total, synced, ready, incomplete, needsResync, failed, unsupported };
  }, [allLocationsWithStatus]);

  const syncableFilteredCount = useMemo(
    () => filteredData.filter(
      (item) =>
        isPayloadSyncCategory(item.category) &&
        (!item.synced || item.needsResync)
    ).length,
    [filteredData]
  );

  const hasActiveFilters =
    statusFilter !== "all" ||
    categoryFilter !== "all" ||
    countryFilter !== "all" ||
    cityFilter !== "all" ||
    neighborhoodFilter !== "all" ||
    locationTypeFilter !== "all";

  const activeLocationScopeLabel = useMemo(() => {
    const parts: string[] = [];

    if (countryFilter !== "all") {
      parts.push(formatActiveScopePart(countryFilter, UNSPECIFIED_COUNTRY_FILTER, "Unspecified country"));
    }

    if (cityFilter !== "all") {
      parts.push(formatActiveScopePart(cityFilter, UNSPECIFIED_CITY_FILTER, "Unspecified city"));
    }

    if (neighborhoodFilter !== "all") {
      parts.push(
        formatActiveScopePart(
          neighborhoodFilter,
          UNSPECIFIED_NEIGHBORHOOD_FILTER,
          "Unspecified neighborhood"
        )
      );
    }

    return parts.length > 0 ? parts.join(" / ") : "All locations";
  }, [cityFilter, countryFilter, neighborhoodFilter]);

  const usesScopedBulkSync =
    statusFilter !== "all" ||
    locationTypeFilter !== "all" ||
    countryFilter !== "all" ||
    cityFilter !== "all" ||
    neighborhoodFilter !== "all";

  const isBulkSyncing = syncAllMutation.isPending || bulkSyncProgress !== null;

  const syncAllButtonLabel = useMemo(() => {
    if (bulkSyncProgress) {
      return `Syncing ${bulkSyncProgress.completed}/${bulkSyncProgress.total}...`;
    }

    if (syncAllMutation.isPending) {
      return "Syncing...";
    }

    return usesScopedBulkSync ? `Sync Filtered (${syncableFilteredCount})` : "Sync All";
  }, [bulkSyncProgress, syncAllMutation.isPending, syncableFilteredCount, usesScopedBulkSync]);

  const toggleStatusFilter = (nextFilter: StatusFilter) => {
    if (nextFilter === "all") {
      setStatusFilter("all");
      return;
    }
    setStatusFilter((current) => (current === nextFilter ? "all" : nextFilter));
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setCountryFilter("all");
    setCityFilter("all");
    setNeighborhoodFilter("all");
    setLocationTypeFilter("all");
  };

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

  const handleSyncAll = async () => {
    const category = categoryFilter !== "all" ? categoryFilter : undefined;
    if (category && !isPayloadSyncCategory(category)) {
      showToast("Payload sync does not support this category.", { x: window.innerWidth / 2, y: 100 });
      return;
    }

    const syncCategory: PayloadSyncCategory | undefined =
      category && isPayloadSyncCategory(category) ? category : undefined;

    if (!usesScopedBulkSync) {
      await syncAllMutation.mutateAsync(syncCategory);
      return;
    }

    const syncTargets = filteredData.filter(
      (item) => isPayloadSyncCategory(item.category) && (!item.synced || item.needsResync)
    );

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
