import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toursApi } from "../tours.api";
import { payloadApi } from "../payload.api";
import type { TourRequest, TourTitleSuggestionRequest, UpdateTourRequest } from "../types";
import { LOCATIONS_BASIC_QUERY_KEY } from "./useLocationsBasic";
import { LOCATIONS_QUERY_KEY } from "./useLocations";
import { PAYLOAD_MEDIA_SETS_QUERY_KEY } from "./usePayloadMediaSets";
import type { ImageVariantType } from "@questurian/lm-shared";

export const TOURS_QUERY_KEY = ["tours"] as const;

export function useTours(options: {
  query?: string;
  ids?: number[];
  limit?: number;
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: [
      ...TOURS_QUERY_KEY,
      options.query ?? "",
      options.ids?.join(",") ?? "",
      options.limit ?? 50,
    ],
    queryFn: () =>
      toursApi.getTours({
        query: options.query,
        ids: options.ids,
        limit: options.limit,
      }),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useCreateTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TourRequest) => toursApi.createTour(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TOURS_QUERY_KEY, refetchType: "all" });
    },
  });
}

export function usePreviewTourImport() {
  return useMutation({
    mutationFn: (url: string) => toursApi.previewImport(url),
  });
}

export function useSuggestTourTitle() {
  return useMutation({
    mutationFn: (data: TourTitleSuggestionRequest) => toursApi.suggestTitle(data),
  });
}

export function useDownloadTourSourceImage() {
  return useMutation({
    mutationFn: (url: string) => toursApi.downloadSourceImage(url),
  });
}

export function useUpdateTour() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTourRequest }) =>
      toursApi.updateTour(id, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TOURS_QUERY_KEY, refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY, refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: LOCATIONS_BASIC_QUERY_KEY, refetchType: "all" }),
      ]);
    },
  });
}

export function useSyncPayloadTour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tourId: number) => payloadApi.syncTour(tourId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TOURS_QUERY_KEY, refetchType: "all" });
    },
  });
}

export function useUploadTourMediaSet() {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: (data: {
      title: string;
      sourceFile: File;
      variantFiles: { type: ImageVariantType; file: File }[];
      photographerCredit: string;
      altText?: string;
    }) => toursApi.uploadTourMediaSet(data, setUploadProgress),
    onSuccess: async () => {
      setUploadProgress(0);
      try {
        await queryClient.invalidateQueries({
          queryKey: [PAYLOAD_MEDIA_SETS_QUERY_KEY],
          refetchType: "all",
        });
      } catch {
        // cache invalidation failure must not block the per-mutation onSuccess
      }
    },
    onError: () => {
      setUploadProgress(0);
    },
  });

  return { ...mutation, uploadProgress };
}
