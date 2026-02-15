import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

const LEADS_API_HEALTH_QUERY_KEY = "leads-api-health";

interface UseLeadsApiHealthOptions {
  enabled?: boolean;
}

export function useLeadsApiHealth(options?: UseLeadsApiHealthOptions) {
  return useQuery({
    queryKey: [LEADS_API_HEALTH_QUERY_KEY],
    queryFn: () => locationsApi.checkLeadsApiHealth(),
    staleTime: 30 * 1000, // 30 seconds
    retry: false, // Don't retry on failure
    enabled: options?.enabled ?? true,
  });
}
