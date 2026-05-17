import { useQuery } from "@tanstack/react-query";
import { locationsApi } from "../locations.api";

const TRANSLATION_API_HEALTH_QUERY_KEY = "translation-api-health";

interface UseTranslationApiHealthOptions {
  enabled?: boolean;
}

export function useTranslationApiHealth(options?: UseTranslationApiHealthOptions) {
  return useQuery({
    queryKey: [TRANSLATION_API_HEALTH_QUERY_KEY],
    queryFn: () => locationsApi.checkTranslationApiHealth(),
    staleTime: 30 * 1000,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}
