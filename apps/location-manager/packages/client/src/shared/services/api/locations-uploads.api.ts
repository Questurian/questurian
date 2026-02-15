import { apiPostFormData, apiDelete } from "./client";
import { API_ENDPOINTS } from "./config";
import { uploadWithProgress } from "./upload-with-progress";
import type { UploadResponse } from "./types";
import type { ImageVariantType } from "@questurian/lm-shared";

export const locationsUploadsApi = {
  async uploadFiles(
    locationId: number,
    files: File[],
    photographerCredit?: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    if (photographerCredit) {
      formData.append("photographerCredit", photographerCredit);
    }

    files.forEach((file) => {
      formData.append("files", file);
    });

    return uploadWithProgress(
      API_ENDPOINTS.ADD_UPLOAD(locationId),
      formData,
      onProgress
    );
  },

  async uploadImageSet(
    locationId: number,
    sourceFile: File,
    variantFiles: { type: ImageVariantType; file: File }[],
    photographerCredit?: string,
    onProgress?: (percent: number) => void,
    altText?: string
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    if (photographerCredit) {
      formData.append("photographerCredit", photographerCredit);
    }

    if (altText) {
      formData.append("altText", altText);
    }

    formData.append("source_0", sourceFile);

    variantFiles.forEach(({ type, file }) => {
      formData.append(`variant_0_${type}`, file);
    });

    return uploadWithProgress(
      API_ENDPOINTS.ADD_UPLOAD_IMAGESET(locationId),
      formData,
      onProgress
    );
  },

  async generateAltText(imageFile: File): Promise<{ altText: string }> {
    const formData = new FormData();
    formData.append("image", imageFile);

    return apiPostFormData<{ altText: string }>(
      API_ENDPOINTS.GENERATE_ALT_TEXT,
      formData
    );
  },

  async deleteUpload(uploadId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_UPLOAD(uploadId));
  },
};
