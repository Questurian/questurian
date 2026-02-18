import { API_BASE_URL, API_ENDPOINTS } from "./config";
import type { Category } from "./types";

export const locationsExportsApi = {
  getReviewsDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REVIEWS(category, id)}`;
  },

  getTripAdvisorReviewsDownloadUrl(category: Category, id: number, lang?: string): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_REVIEWS(category, id, lang)}`;
  },

  getMergedReviewsDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_MERGED_REVIEWS(category, id)}`;
  },

  getRejectsReportDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REJECTS_REPORT(category, id)}`;
  },

  getTripAdvisorPlaceDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_PLACE(category, id)}`;
  },

  getLocationExportDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_LOCATION_EXPORT(category, id)}`;
  },

  getAiJsonDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_AI_JSON(category, id)}`;
  },
};
