import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

export const LOCATIONS_QUERY_KEY = ["locations"] as const;

export function useLocations() {
  return useQuery({
    queryKey: LOCATIONS_QUERY_KEY,
    queryFn: () => locationsApi.getLocations(),
  });
}
