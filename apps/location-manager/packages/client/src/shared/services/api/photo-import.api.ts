import { apiGet, apiPost, apiDelete } from "./client";
import type {
  PhotoImportPreview,
  PhotoImportStartPhoto,
  PhotoImportStartResponse,
  StagedSourceSnapshot,
} from "@questurian/lm-shared";
export type { StagedSourceSnapshot } from "@questurian/lm-shared";

export const photoImportApi = {
  preview(locationId: number): Promise<{ preview: PhotoImportPreview }> {
    return apiGet(`/api/locations/${locationId}/photo-import/preview`);
  },

  previewByPlace(placeId: string): Promise<{ preview: PhotoImportPreview }> {
    return apiGet(`/api/photo-import/preview-by-place`, { placeId });
  },

  /**
   * Fetch the bytes of a single Google place photo via the server-side proxy.
   * Used by the Add-flow pre-Create crop pipeline (ADR-0007). Returns a Blob the
   * caller can hand to MultiVariantCropperModal.
   */
  async proxyPhotoBytes(photoName: string, maxWidth?: number): Promise<Blob> {
    const params = new URLSearchParams({ name: photoName });
    if (maxWidth !== undefined) params.set("maxWidth", String(maxWidth));
    const res = await fetch(`/api/photo-import/proxy?${params.toString()}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Failed to fetch photo bytes (${res.status})`);
    }
    return res.blob();
  },

  start(
    locationId: number,
    photos: PhotoImportStartPhoto[]
  ): Promise<{ result: PhotoImportStartResponse }> {
    return apiPost(`/api/locations/${locationId}/photo-import/start`, { photos });
  },

  sources(locationId: number): Promise<{ sources: StagedSourceSnapshot[] }> {
    return apiGet(`/api/locations/${locationId}/photo-import/sources`);
  },

  reject(locationId: number, photoName: string): Promise<{ ok: true }> {
    return apiPost(`/api/locations/${locationId}/photo-import/reject`, { photoName });
  },

  unreject(locationId: number, photoName: string): Promise<{ ok: true }> {
    return apiPost(`/api/locations/${locationId}/photo-import/unreject`, { photoName });
  },

  retry(uploadId: number): Promise<{ upload: unknown }> {
    return apiPost(`/api/uploads/${uploadId}/photo-import/retry`);
  },

  deleteStagedSource(uploadId: number): Promise<{ ok: true }> {
    return apiDelete(`/api/uploads/${uploadId}/staged-source`);
  },
};
