import { formatLocationName } from "@questurian/lm-shared";
import {
  isPayloadSyncCategory,
  matchesFacetFilter,
} from "@client/features/admin/utils/payload-sync-filter-utils";
import {
  UNSPECIFIED_CITY_FILTER,
  UNSPECIFIED_COUNTRY_FILTER,
  UNSPECIFIED_NEIGHBORHOOD_FILTER,
  type CityFilter,
  type CountryFilter,
  type LocationWithSyncStatus,
  type NeighborhoodFilter,
  type StatusFilter,
} from "./payload-sync-filter.types";

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

export function matchesCountryFilter(country: string | null, filter: CountryFilter): boolean {
  return matchesFacetFilter(country, filter, UNSPECIFIED_COUNTRY_FILTER);
}

export function matchesCityFilter(city: string | null, filter: CityFilter): boolean {
  return matchesFacetFilter(city, filter, UNSPECIFIED_CITY_FILTER);
}

export function matchesNeighborhoodFilter(neighborhood: string | null, filter: NeighborhoodFilter): boolean {
  return matchesFacetFilter(neighborhood, filter, UNSPECIFIED_NEIGHBORHOOD_FILTER);
}

export function formatActiveScopePart(value: string, unspecifiedValue: string, unspecifiedLabel: string): string {
  if (value === unspecifiedValue) {
    return unspecifiedLabel;
  }

  return formatLocationName(value);
}
