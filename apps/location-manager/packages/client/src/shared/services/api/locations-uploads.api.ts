import { apiPostFormData, apiDelete, apiPatch, apiPost, unwrapEntry } from "./client";
import { API_ENDPOINTS } from "./config";
import { uploadWithProgress } from "./upload-with-progress";
import type { UploadResponse } from "./types";
import type { ImageVariantType, VariantCropRegion } from "@questurian/lm-shared";
import type { Category } from "./types";

type VariantUpload = {
  type: ImageVariantType;
  file: File;
  cropRegion?: VariantCropRegion;
};

const buildCropRegionsPayload = (
  variantFiles: VariantUpload[],
): Partial<Record<ImageVariantType, VariantCropRegion>> | null => {
  const payload: Partial<Record<ImageVariantType, VariantCropRegion>> = {};
  let hasAny = false;
  for (const { type, cropRegion } of variantFiles) {
    if (cropRegion) {
      payload[type] = cropRegion;
      hasAny = true;
    }
  }
  return hasAny ? payload : null;
};

export const locationsUploadsApi = {
  async uploadFiles(
    category: Category,
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
      API_ENDPOINTS.ADD_UPLOAD(category, locationId),
      formData,
      onProgress
    );
  },

  async uploadImageSet(
    category: Category,
    locationId: number,
    sourceFile: File,
    variantFiles: VariantUpload[],
    photographerCredit: string,
    onProgress?: (percent: number) => void,
    altText?: string
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    formData.append("photographerCredit", photographerCredit);

    if (altText) {
      formData.append("altText", altText);
    }

    formData.append("source_0", sourceFile);

    variantFiles.forEach(({ type, file }) => {
      formData.append(`variant_0_${type}`, file);
    });

    const cropRegions = buildCropRegionsPayload(variantFiles);
    if (cropRegions) {
      formData.append("cropRegions_0", JSON.stringify(cropRegions));
    }

    return uploadWithProgress(
      API_ENDPOINTS.ADD_UPLOAD_IMAGESET(category, locationId),
      formData,
      onProgress
    );
  },

  async generateAltText(imageFile: File, uploadId?: number): Promise<{ altText: string }> {
    const formData = new FormData();
    formData.append("image", imageFile);
    if (uploadId) formData.append("uploadId", String(uploadId));

    return apiPostFormData<{ altText: string }>(
      API_ENDPOINTS.GENERATE_ALT_TEXT,
      formData
    );
  },

  async deleteUpload(uploadId: number): Promise<void> {
    await apiDelete(API_ENDPOINTS.DELETE_UPLOAD(uploadId));
  },

  async reprocessUploadVariants(uploadId: number): Promise<UploadResponse["entry"]> {
    const response = await apiPost<UploadResponse>(
      API_ENDPOINTS.REPROCESS_UPLOAD_VARIANTS(uploadId)
    );
    return unwrapEntry(response);
  },

  async replaceUploadVariants(
    uploadId: number,
    sourceFile: File,
    variantFiles: VariantUpload[],
    onProgress?: (percent: number) => void,
    altText?: string
  ): Promise<UploadResponse["entry"]> {
    const formData = new FormData();

    if (altText !== undefined) {
      formData.append("altText", altText);
    }

    formData.append("source_0", sourceFile);

    variantFiles.forEach(({ type, file }) => {
      formData.append(`variant_0_${type}`, file);
    });

    const cropRegions = buildCropRegionsPayload(variantFiles);
    if (cropRegions) {
      formData.append("cropRegions_0", JSON.stringify(cropRegions));
    }

    return uploadWithProgress(
      API_ENDPOINTS.REPLACE_UPLOAD_VARIANTS(uploadId),
      formData,
      onProgress
    );
  },

  async updateUploadPhotographerCredit(
    uploadId: number,
    photographerCredit: string
  ): Promise<UploadResponse["entry"]> {
    const response = await apiPatch<UploadResponse>(
      API_ENDPOINTS.UPDATE_UPLOAD_PHOTOGRAPHER_CREDIT(uploadId),
      { photographerCredit }
    );
    return unwrapEntry(response);
  },
};
