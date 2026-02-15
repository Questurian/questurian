import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "@client/shared/services/api";

export function useLocationDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ["location-detail", id],
    queryFn: () => locationsApi.getLocationById(id!),
    enabled: enabled && id !== null,
    refetchOnMount: "always",
  });
}
