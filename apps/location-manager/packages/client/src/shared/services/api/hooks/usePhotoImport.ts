import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PhotoImportStartPhoto } from "@questurian/lm-shared";
import { photoImportApi } from "../photo-import.api";

export const photoImportKeys = {
  preview: (locationId: number) => ["photo-import", "preview", locationId] as const,
  previewByPlace: (placeId: string) => ["photo-import", "preview-by-place", placeId] as const,
  sources: (locationId: number) => ["photo-import", "sources", locationId] as const,
};

export function usePhotoImportPreviewByPlace(placeId: string | null | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: photoImportKeys.previewByPlace(placeId ?? ""),
    queryFn: () => photoImportApi.previewByPlace(placeId!),
    enabled: !!placeId && opts?.enabled !== false,
    staleTime: 30_000,
  });
}

export function usePhotoImportPreview(locationId: number | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: photoImportKeys.preview(locationId ?? -1),
    queryFn: () => photoImportApi.preview(locationId!),
    enabled: !!locationId && opts?.enabled !== false,
    staleTime: 30_000,
  });
}

/**
 * Poll StagedSource statuses while any source is still 'downloading'.
 * Stops polling once every snapshot is 'ready' or 'failed'.
 */
export function useStagedSources(locationId: number | null, opts?: { enabled?: boolean; pollForIncoming?: boolean }) {
  return useQuery({
    queryKey: photoImportKeys.sources(locationId ?? -1),
    queryFn: () => photoImportApi.sources(locationId!),
    enabled: !!locationId && opts?.enabled !== false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const anyDownloading = data.sources.some((s) => s.stagedSourceStatus === "downloading");
      return anyDownloading || opts?.pollForIncoming ? 1500 : false;
    },
  });
}

export function useStartPhotoImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      locationId,
      photos,
    }: {
      locationId: number;
      photos: PhotoImportStartPhoto[];
    }) => photoImportApi.start(locationId, photos),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: photoImportKeys.sources(vars.locationId) });
      qc.invalidateQueries({ queryKey: photoImportKeys.preview(vars.locationId) });
    },
  });
}

export function useRejectPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, photoName }: { locationId: number; photoName: string }) =>
      photoImportApi.reject(locationId, photoName),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: photoImportKeys.preview(vars.locationId) });
    },
  });
}

export function useUnrejectPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, photoName }: { locationId: number; photoName: string }) =>
      photoImportApi.unreject(locationId, photoName),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: photoImportKeys.preview(vars.locationId) });
    },
  });
}

export function useRetryStagedSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadId }: { uploadId: number; locationId: number }) =>
      photoImportApi.retry(uploadId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: photoImportKeys.sources(vars.locationId) });
    },
  });
}

export function useDeleteStagedSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadId }: { uploadId: number; locationId: number }) =>
      photoImportApi.deleteStagedSource(uploadId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: photoImportKeys.sources(vars.locationId) });
      qc.invalidateQueries({ queryKey: photoImportKeys.preview(vars.locationId) });
    },
  });
}
