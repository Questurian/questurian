import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";
import type { Category } from "@client/shared/services/api/types";
import { extractPayloadSyncLocationScope } from "@client/features/admin/utils/payload-sync-filter-utils";
import {
  UNSPECIFIED_TYPE_FILTER,
  type CityFilter,
  type CountryFilter,
  type LocationTypeFilter,
  type LocationWithSyncStatus,
  type LocationsBasicData,
  type NeighborhoodFilter,
  type StatusFilter,
} from "./payload-sync-filter.types";
import {
  matchesCityFilter,
  matchesCountryFilter,
  matchesNeighborhoodFilter,
  matchesStatusFilter,
} from "./payload-sync-filter-predicates";

export function buildSyncStatusMap(
  statusData: SyncStatusResponse[] | undefined
): Map<number, SyncStatusResponse> {
  const map = new Map<number, SyncStatusResponse>();
  (statusData ?? []).forEach((item) => {
    map.set(item.locationId, item);
  });
  return map;
}

export function buildLocationsWithStatus(
  locationsBasicData: LocationsBasicData | undefined,
  syncStatusMap: Map<number, SyncStatusResponse>
): LocationWithSyncStatus[] {
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
}

/**
 * Status + category narrowing, the common base every derived list starts from.
 */
export function applyStatusAndCategoryFilters(
  items: LocationWithSyncStatus[],
  statusFilter: StatusFilter,
  categoryFilter: Category | "all"
): LocationWithSyncStatus[] {
  let filtered = items.filter((item) => matchesStatusFilter(item, statusFilter));

  if (categoryFilter !== "all") {
    filtered = filtered.filter((item) => item.category === categoryFilter);
  }

  return filtered;
}

export function applyLocationTypeFilter(
  items: LocationWithSyncStatus[],
  locationTypeFilter: LocationTypeFilter
): LocationWithSyncStatus[] {
  if (locationTypeFilter === "all") {
    return items;
  }

  if (locationTypeFilter === UNSPECIFIED_TYPE_FILTER) {
    return items.filter((item) => !item.type);
  }

  return items.filter((item) => item.type === locationTypeFilter);
}

export function applyScopeFilters(
  items: LocationWithSyncStatus[],
  countryFilter: CountryFilter,
  cityFilter: CityFilter,
  neighborhoodFilter: NeighborhoodFilter
): LocationWithSyncStatus[] {
  return items
    .filter((item) => matchesCountryFilter(item.country, countryFilter))
    .filter((item) => matchesCityFilter(item.city, cityFilter))
    .filter((item) => matchesNeighborhoodFilter(item.neighborhood, neighborhoodFilter));
}

export function computeSyncStats(items: LocationWithSyncStatus[]) {
  const total = items.length;
  const synced = items.filter((item) => matchesStatusFilter(item, "synced")).length;
  const ready = items.filter((item) => matchesStatusFilter(item, "ready")).length;
  const incomplete = items.filter((item) => matchesStatusFilter(item, "incomplete")).length;
  const needsResync = items.filter((item) => matchesStatusFilter(item, "needs_resync")).length;
  const failed = items.filter((item) => matchesStatusFilter(item, "failed")).length;
  const unsupported = items.filter((item) => matchesStatusFilter(item, "unsupported")).length;

  return { total, synced, ready, incomplete, needsResync, failed, unsupported };
}
