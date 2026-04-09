import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { payloadApi } from "../payload.api";

export const PAYLOAD_MEDIA_SETS_QUERY_KEY = "payload-media-sets";

interface UsePayloadMediaSetsOptions {
  query?: string;
  page?: number;
  limit?: number;
  ids?: string[];
  enabled?: boolean;
  keepPreviousData?: boolean;
}

export function usePayloadMediaSets(options: UsePayloadMediaSetsOptions = {}) {
  const idsKey = options.ids?.join(",") ?? "";

  return useQuery({
    queryKey: [
      PAYLOAD_MEDIA_SETS_QUERY_KEY,
      options.query ?? "",
      options.page ?? 1,
      options.limit ?? 12,
      idsKey,
    ],
    queryFn: () =>
      payloadApi.getMediaSets({
        query: options.query,
        page: options.page,
        limit: options.limit,
        ids: options.ids,
      }),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
  });
}
