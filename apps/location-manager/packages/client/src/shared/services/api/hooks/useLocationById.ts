import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

export const LOCATION_BY_ID_QUERY_KEY = (id: number) => ["location", id] as const;

export function useLocationById(id: number | null) {
  return useQuery({
    queryKey: LOCATION_BY_ID_QUERY_KEY(id!),
    queryFn: () => locationsApi.getLocationById(id!),
    enabled: id !== null,
  });
}








