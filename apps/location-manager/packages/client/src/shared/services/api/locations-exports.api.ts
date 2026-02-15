import { API_BASE_URL, API_ENDPOINTS } from "./config";

export const locationsExportsApi = {
  getReviewsDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REVIEWS(id)}`;
  },

  getTripAdvisorReviewsDownloadUrl(id: number, lang?: string): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_REVIEWS(id, lang)}`;
  },

  getMergedReviewsDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_MERGED_REVIEWS(id)}`;
  },

  getRejectsReportDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_REJECTS_REPORT(id)}`;
  },

  getTripAdvisorPlaceDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_PLACE(id)}`;
  },

  getLocationExportDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_LOCATION_EXPORT(id)}`;
  },

  getAiJsonDownloadUrl(id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_AI_JSON(id)}`;
  },
};
