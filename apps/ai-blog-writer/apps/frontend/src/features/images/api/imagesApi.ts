/**
 * API client for image upload and processing
 */

import type { ImageVariantType } from '../utils/imageProcessing';
import { generateAltTextApi } from './alt-text/generate-alt-text.api';
import type {
  GenerateSocialImageResponse,
  ProcessImageOnlyResponse,
  UploadImageResponse,
  UploadProgress,
} from './contracts/image-api.contracts';
import { generateSocialImageApi } from './generate-social-image.api';
import { processImageOnlyApi } from './processing/process-image-only.api';
import { uploadSingleApi } from './uploads/upload-single.api';
import { uploadVariantsApi } from './uploads/upload-variants.api';

export type { UploadImageResponse, UploadProgress };
export type { GenerateSocialImageResponse };

/**
 * Upload pre-processed image variants to be stored in Payload CMS
 * This is used after client-side cropping with MultiVariantCropper
 */
export async function uploadImageVariants(
  variantFiles: { type: ImageVariantType; file: File }[],
  externalRef: string,
  altText: string,
  locationRef: number,
  token: string,
  photographerCredit: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadImageResponse> {
  return uploadVariantsApi({
    variantFiles,
    externalRef,
    altText,
    locationRef,
    token,
    photographerCredit,
    onProgress,
  });
}

/**
 * Upload a single original image to be processed server-side
 * This is the simpler flow without client-side cropping
 */
export async function uploadImage(
  file: File,
  externalRef: string,
  altText: string,
  locationRef: number,
  token: string,
  photographerCredit: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadImageResponse> {
  return uploadSingleApi({
    file,
    externalRef,
    altText,
    locationRef,
    token,
    photographerCredit,
    onProgress,
  });
}

/**
 * Generate alt text for an image using Gemini vision AI
 */
export async function generateAltText(
  file: File,
  narrativeFocus?: string
): Promise<string> {
  return generateAltTextApi({ file, narrativeFocus });
}

/**
 * Process an image without uploading to Payload (for testing)
 */
export async function processImageOnly(
  file: File,
  altText: string = ''
): Promise<ProcessImageOnlyResponse> {
  return processImageOnlyApi({ file, altText });
}

export async function generateSocialImageFromFeatured(
  featuredAssetId: number,
  token: string
): Promise<GenerateSocialImageResponse> {
  return generateSocialImageApi({ featuredAssetId, token });
}
