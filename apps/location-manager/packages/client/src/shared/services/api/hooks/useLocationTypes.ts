import { useQuery } from "@tanstack/react-query";
import { typesApi } from "../types.api";
import type { LocationCategory } from "@shared/types/location-category";

const TYPES_QUERY_KEYS = {
  dining: ["dining-types"],
  accommodations: ["accommodations-types"],
  attractions: ["attractions-types"],
  nightlife: ["nightlife-types"],
} as const;

export function useLocationTypes(category?: LocationCategory) {
  return useQuery({
    queryKey: category ? TYPES_QUERY_KEYS[category] : [],
    queryFn: () => {
      switch (category) {
        case "dining":
          return typesApi.getDiningTypes();
        case "accommodations":
          return typesApi.getAccommodationsTypes();
        case "attractions":
          return typesApi.getAttractionsTypes();
        case "nightlife":
          return typesApi.getNightlifeTypes();
        default:
          return Promise.resolve([]);
      }
    },
    enabled: !!category,
  });
}
