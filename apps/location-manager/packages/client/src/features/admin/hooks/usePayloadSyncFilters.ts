import { useEffect, useMemo, useState } from "react";
import { formatLocationName } from "@questurian/lm-shared";
import type { Category } from "@client/shared/services/api/types";
import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";
import {
  buildFacetOptions,
  extractPayloadSyncLocationScope,
  isPayloadSyncCategory,
  matchesFacetFilter,
} from "@client/features/admin/utils/payload-sync-filter-utils";

export type StatusFilter = "all" | "synced" | "ready" | "incomplete" | "needs_resync" | "failed" | "unsupported";

export const UNSPECIFIED_COUNTRY_FILTER = "__unspecified_country__";
export const UNSPECIFIED_CITY_FILTER = "__unspecified_city__";
export const UNSPECIFIED_NEIGHBORHOOD_FILTER = "__unspecified_neighborhood__";
export const UNSPECIFIED_TYPE_FILTER = "__unspecified_type__";

export type CountryFilter = "all" | typeof UNSPECIFIED_COUNTRY_FILTER | string;
export type CityFilter = "all" | typeof UNSPECIFIED_CITY_FILTER | string;
export type NeighborhoodFilter = "all" | typeof UNSPECIFIED_NEIGHBORHOOD_FILTER | string;
export type LocationTypeFilter = "all" | typeof UNSPECIFIED_TYPE_FILTER | string;

export interface LocationWithSyncStatus {
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

interface LocationBasic {
  id: number;
  title?: string | null;
  name: string;
  location: string | null;
  locationKey: string | null;
  country: string | null;
  category: Category;
  type?: string | null;
  isComplete: boolean;
}

interface LocationsBasicData {
  locations?: LocationBasic[];
}

export function matchesStatusFilter(item: LocationWithSyncStatus, filter: StatusFilter): boolean {
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

export function formatLabel(value: string): string {
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

export function usePayloadSyncFilters(
  statusData: SyncStatusResponse[] | undefined,
  locationsBasicData: LocationsBasicData | undefined
) {
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [countryFilter, setCountryFilter] = useState<CountryFilter>("all");
  const [cityFilter, setCityFilter] = useState<CityFilter>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<NeighborhoodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState<LocationTypeFilter>("all");

  const syncStatusMap = useMemo(() => {
    const map = new Map<number, SyncStatusResponse>();
    (statusData ?? []).forEach((item) => {
      map.set(item.locationId, item);
    });
    return map;
  }, [statusData]);

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

  return {
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
  };
}
