import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import type { Category } from "../types";

export const LOCATIONS_BASIC_QUERY_KEY = ["locations-basic"] as const;

export function useLocationsBasic(params?: {
  category?: Category;
  locationKey?: string;
}) {
  return useQuery({
    queryKey: ["locations-basic", params?.category, params?.locationKey],
    queryFn: () => locationsApi.getLocationsBasic(params),
    enabled: true, // Always enabled - show all locations by default
  });
}


