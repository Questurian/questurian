import { API_BASE_URL, API_ENDPOINTS } from "./config";
import type { Category } from "./types";

export const locationsExportsApi = {
  getTripAdvisorPlaceDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_TRIPADVISOR_PLACE(category, id)}`;
  },

  getLocationExportDownloadUrl(category: Category, id: number): string {
    return `${API_BASE_URL}${API_ENDPOINTS.DOWNLOAD_LOCATION_EXPORT(category, id)}`;
  },
};
