import { apiGet, apiPatch, apiPost } from "./client";
import { API_ENDPOINTS } from "./config";
import { uploadFormDataWithProgress } from "./upload-with-progress";
import type {
  Tour,
  TourMediaSetResponse,
  TourRequest,
  TourResponse,
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
