import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";
import { LOCATION_DETAIL_QUERY_KEY } from "./location-query-keys";
import type { Category } from "../types";

export const LOCATION_BY_ID_QUERY_KEY = (category: string, id: number) =>
  LOCATION_DETAIL_QUERY_KEY(category, id);

export function useLocationById(id: number | null, category: Category | null) {
  const queryCategory = category ?? "missing-category";
  return useQuery({
    queryKey: LOCATION_BY_ID_QUERY_KEY(queryCategory, id!),
    queryFn: () => locationsApi.getLocationById(id!, category!),
    enabled: id !== null && category !== null,
    refetchOnMount: "always",
  });
}
