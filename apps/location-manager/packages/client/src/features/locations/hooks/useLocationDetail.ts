import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "@client/shared/services/api";

export const LOCATION_DETAIL_QUERY_KEY = ["location-detail"] as const;

export function useLocationDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ["location-detail", id],
    queryFn: () => locationsApi.getLocationById(id!),
    enabled: enabled && id !== null,
  });
}
