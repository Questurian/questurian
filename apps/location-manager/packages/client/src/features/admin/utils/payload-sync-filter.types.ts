import type { Category } from "@client/shared/services/api/types";
import type { SyncStatusResponse } from "@client/shared/services/api/types/payload.types";

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

export interface LocationBasic {
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

export interface LocationsBasicData {
  locations?: LocationBasic[];
}
