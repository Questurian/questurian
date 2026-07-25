import { useEffect, useMemo, useState } from "react";
import { formatLocationName } from "@questurian/lm-shared";
import type { Category } from "@client/shared/services/api/types";
import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";
import { buildFacetOptions } from "@client/features/admin/utils/payload-sync-filter-utils";
import {
  UNSPECIFIED_CITY_FILTER,
  UNSPECIFIED_COUNTRY_FILTER,
  UNSPECIFIED_NEIGHBORHOOD_FILTER,
  UNSPECIFIED_TYPE_FILTER,
  type CityFilter,
  type CountryFilter,
  type LocationTypeFilter,
  type LocationsBasicData,
  type NeighborhoodFilter,
  type StatusFilter,
} from "@client/features/admin/utils/payload-sync-filter.types";
import {
  formatActiveScopePart,
  formatLabel,
  matchesCityFilter,
  matchesCountryFilter,
} from "@client/features/admin/utils/payload-sync-filter-predicates";
import {
  applyLocationTypeFilter,
  applyScopeFilters,
  applyStatusAndCategoryFilters,
  buildLocationsWithStatus,
  buildSyncStatusMap,
  computeSyncStats,
} from "@client/features/admin/utils/payload-sync-selectors";

// Re-exported so existing importers of this module keep working unchanged.
export {
  UNSPECIFIED_CITY_FILTER,
  UNSPECIFIED_COUNTRY_FILTER,
  UNSPECIFIED_NEIGHBORHOOD_FILTER,
  UNSPECIFIED_TYPE_FILTER,
} from "@client/features/admin/utils/payload-sync-filter.types";
export type {
  CityFilter,
  CountryFilter,
  LocationBasic,
  LocationTypeFilter,
  LocationWithSyncStatus,
  LocationsBasicData,
  NeighborhoodFilter,
  StatusFilter,
} from "@client/features/admin/utils/payload-sync-filter.types";
export {
  formatLabel,
  matchesStatusFilter,
} from "@client/features/admin/utils/payload-sync-filter-predicates";

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

  const syncStatusMap = useMemo(() => buildSyncStatusMap(statusData), [statusData]);

  const allLocationsWithStatus = useMemo(
    () => buildLocationsWithStatus(locationsBasicData, syncStatusMap),
    [locationsBasicData, syncStatusMap]
  );

  const locationHierarchyBaseData = useMemo(() => {
    return applyLocationTypeFilter(
      applyStatusAndCategoryFilters(allLocationsWithStatus, statusFilter, categoryFilter),
      locationTypeFilter
    );
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
    return applyScopeFilters(
      applyStatusAndCategoryFilters(allLocationsWithStatus, statusFilter, categoryFilter),
      countryFilter,
      cityFilter,
      neighborhoodFilter
    );
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
    return applyLocationTypeFilter(
      applyScopeFilters(
        applyStatusAndCategoryFilters(allLocationsWithStatus, statusFilter, categoryFilter),
        countryFilter,
        cityFilter,
        neighborhoodFilter
      ),
      locationTypeFilter
    );
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

  const stats = useMemo(() => computeSyncStats(allLocationsWithStatus), [allLocationsWithStatus]);

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
