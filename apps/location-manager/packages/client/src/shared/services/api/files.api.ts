/**
 * Files and images API
 */

import { apiPost } from "./client";
import { API_BASE_URL, API_ENDPOINTS } from "./config";
import type { SuccessResponse, OpenFolderRequest } from "./types";

// ============================================================================
// FILES & IMAGES
// ============================================================================

export const filesApi = {
  /**
   * Open a folder in the system file explorer
   */
  async openFolder(folderPath: string): Promise<SuccessResponse> {
    const data: OpenFolderRequest = { folderPath };
    return apiPost<SuccessResponse>(API_ENDPOINTS.OPEN_FOLDER, data);
  },

  /**
   * Get the full URL for an image path
   * @param imagePath - Server path (e.g., "src/data/images/location/file.jpg")
   * @returns Full URL to access the image via /api/images/* endpoint
   */
  getImageUrl(imagePath: string): string {
    // Convert server path to API endpoint path
    // e.g., "src/data/images/location/file.jpg" -> "/api/images/location/file.jpg"
    const apiPath = imagePath.replace(/^src\/data\//, '/api/');
    return API_BASE_URL ? `${API_BASE_URL}${apiPath}` : apiPath;
  },

  /**
   * Preload an image by creating an Image element
   * Useful for optimistic loading before display
   */
  async preloadImage(imagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
      img.src = this.getImageUrl(imagePath);
    });
  },
};
