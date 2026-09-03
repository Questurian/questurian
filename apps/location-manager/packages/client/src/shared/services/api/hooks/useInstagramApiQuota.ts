import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

export const INSTAGRAM_API_QUOTA_QUERY_KEY = ["instagram-api-quota"] as const;

export function useInstagramApiQuota(poll: boolean) {
  return useQuery({
    queryKey: INSTAGRAM_API_QUOTA_QUERY_KEY,
    queryFn: () => locationsApi.getInstagramApiQuota(),
    refetchInterval: poll ? 2_000 : false,
  });
}
