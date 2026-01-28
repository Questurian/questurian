import { useQuery } from "@tanstack/react-query";
import { hierarchyApi } from "@client/shared/services/api";

export function useCountries() {
  return useQuery({
    queryKey: ["countries"],
    queryFn: () => hierarchyApi.getCountries(),
    select: (data) => data.countries // Returns Country[] with nested cities
  });
}
