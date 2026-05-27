/**
 * API client for image upload and processing
 */

import type { ImageVariantType } from '../utils/imageProcessing';
import { fluxEditApi } from './flux-edit.api';
import { generateAltTextApi } from './alt-text/generate-alt-text.api';
import { describeSceneApi } from './describe-scene.api';
import { buildEditPromptApi } from './build-edit-prompt.api';
import { postJson } from './client/imageApiClient';
import { parseErrorMessage } from './errors/image-api-error.utils';
import type {
  FluxEditImageResponse,
  GenerateSocialImageResponse,
  ProcessImageOnlyResponse,
  UploadImageResponse,
  UploadProgress,
  UploadSocialImageResponse,
} from './contracts/image-api.contracts';
import { generateSocialImageApi } from './generate-social-image.api';
import { processImageOnlyApi } from './processing/process-image-only.api';
import { uploadSocialImageApi } from './upload-social-image.api';
import { uploadSingleApi } from './uploads/upload-single.api';
import { uploadVariantsApi } from './uploads/upload-variants.api';

export type { UploadImageResponse, UploadProgress };
export type { GenerateSocialImageResponse };
export type { UploadSocialImageResponse };
export type { FluxEditImageResponse };

/**
 * Upload pre-processed image variants to be stored in Payload CMS
 * This is used after client-side cropping with MultiVariantCropper
 */
export async function uploadImageVariants(
  variantFiles: { type: ImageVariantType; file: File }[],
  externalRef: string,
  altText: string,
  locationRef: number | undefined,
  token: string,
  photographerCredit: string,
  onProgress?: (progress: UploadProgress) => void,
  tags?: number[]
): Promise<UploadImageResponse> {
  return uploadVariantsApi({
    variantFiles,
    externalRef,
    altText,
    locationRef,
    token,
    photographerCredit,
    onProgress,
    tags,
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
 * Generate a mise-en-scène style description of an image — framing, subjects,
 * setting, lighting — for use as an image-recreation prompt.
 */
export async function describeImageScene(file: File): Promise<string> {
  return describeSceneApi(file);
}

/**
 * Build a model-agnostic image-edit prompt by combining the image, its scene
 * description, and the user's requested changes.
 */
export async function buildImageEditPrompt(
  file: File,
  sceneDescription: string,
  changeRequest: string,
): Promise<string> {
  return buildEditPromptApi({ file, sceneDescription, changeRequest });
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

export async function uploadSocialImage(
  file: File,
  altText: string,
  locationRef: number,
  token: string,
  photographerCredit: string
): Promise<UploadSocialImageResponse> {
  return uploadSocialImageApi({
    file,
    altText,
    locationRef,
    token,
    photographerCredit,
  });
}

/**
 * Resolve tag names to IDs, creating any that don't exist in Payload.
 */
export async function resolveTagsByName(
  names: string[],
  token: string,
): Promise<{ id: number; name: string }[]> {
  const response = await postJson('/images/tags/resolve', { names }, token)
  if (!response.ok) {
    const message = await parseErrorMessage(response, 'Failed to resolve tags')
    throw new Error(message)
  }
  const data = await response.json() as { tags: { id: number; name: string }[] }
  return data.tags
}

export async function generateFluxEditedImage(
  prompt: string,
  referenceImage: File,
  token: string,
  options?: {
    additionalReferenceImages?: File[];
    modelId?: string;
    width?: number;
    height?: number;
    safetyTolerance?: number;
    promptUpsampling?: boolean;
    seed?: string | number;
  },
): Promise<FluxEditImageResponse> {
  return fluxEditApi({
    prompt,
    referenceImage,
    token,
    ...options,
  });
}
