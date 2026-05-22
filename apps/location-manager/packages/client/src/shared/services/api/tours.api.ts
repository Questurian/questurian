import { apiGet, apiPatch, apiPost } from "./client";
import { API_BASE_URL, API_ENDPOINTS } from "./config";
import { uploadFormDataWithProgress } from "./upload-with-progress";
import type {
  Tour,
  TourDraftPreview,
  TourImportPreviewResponse,
  TourMediaSetResponse,
  TourRequest,
  TourResponse,
  TourTitleSuggestionRequest,
  TourTitleSuggestionResponse,
  ToursResponse,
  UpdateTourRequest,
} from "./types";
import type { ImageVariantType } from "@questurian/lm-shared";

export const toursApi = {
  async getTours(params?: {
    query?: string;
    ids?: number[];
    limit?: number;
  }): Promise<Tour[]> {
    const searchParams: Record<string, string> = {};

    if (params?.query) {
      searchParams.query = params.query;
    }
    if (params?.ids && params.ids.length > 0) {
      searchParams.ids = params.ids.join(",");
    }
    if (params?.limit) {
      searchParams.limit = String(params.limit);
    }

    const response = await apiGet<ToursResponse>(API_ENDPOINTS.TOURS, searchParams);
    return response.tours;
  },

  async createTour(data: TourRequest): Promise<Tour> {
    const response = await apiPost<TourResponse>(API_ENDPOINTS.TOURS, data);
    return response.tour;
  },

  async previewImport(url: string): Promise<TourDraftPreview> {
    const response = await apiPost<TourImportPreviewResponse>(
      API_ENDPOINTS.TOUR_IMPORT_PREVIEW,
      { url }
    );
    return response.draft;
  },

  async suggestTitle(data: TourTitleSuggestionRequest): Promise<TourTitleSuggestionResponse> {
    return apiPost<TourTitleSuggestionResponse>(API_ENDPOINTS.TOUR_TITLE_SUGGESTION, data);
  },

  async downloadSourceImage(url: string): Promise<File> {
    const params = new URLSearchParams({ url });
    const path = `${API_ENDPOINTS.TOUR_SOURCE_IMAGE}?${params.toString()}`;
    const requestUrl = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
    const response = await fetch(requestUrl);
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(text || `Source image download failed (${response.status})`);
    }
    const blob = await response.blob();
    const extension = blob.type.split("/")[1] || "jpg";
    return new File([blob], `tour-source.${extension}`, { type: blob.type || "image/jpeg" });
  },

  async updateTour(id: number, data: UpdateTourRequest): Promise<Tour> {
    const response = await apiPatch<TourResponse>(API_ENDPOINTS.TOUR_BY_ID(id), data);
    return response.tour;
  },

  async uploadTourMediaSet(
    data: {
      title: string;
      sourceFile: File;
      variantFiles: { type: ImageVariantType; file: File }[];
      photographerCredit: string;
      altText?: string;
    },
    onProgress?: (percent: number) => void
  ): Promise<TourMediaSetResponse> {
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("photographerCredit", data.photographerCredit);
    if (data.altText) {
      formData.append("altText", data.altText);
    }
    formData.append("source_0", data.sourceFile);
    data.variantFiles.forEach(({ type, file }) => {
      formData.append(`variant_0_${type}`, file);
    });

    return uploadFormDataWithProgress<TourMediaSetResponse>(
      API_ENDPOINTS.TOUR_MEDIA_SET,
      formData,
      onProgress
    );
  },
};
