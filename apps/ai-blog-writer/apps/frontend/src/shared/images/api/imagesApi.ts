/**
 * Compatibility facade for shared image APIs.
 *
 * Keep the positional call signatures stable; focused API modules own transport,
 * response parsing, and error handling.
 */

import type { ImageVariantType } from '../utils/imageProcessing';
import { fluxEditApi } from './flux-edit.api';
import { generateAltTextApi } from './alt-text/generate-alt-text.api';
import { describeSceneApi } from './describe-scene.api';
import { describeSubjectApi } from './describe-subject.api';
import { buildEditPromptApi } from './build-edit-prompt.api';
import { buildInsertPromptApi, type InsertImage } from './build-insert-prompt.api';
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
 * Describe the subject(s) of an image that will be inserted into another scene.
 */
export async function describeImageSubject(file: File): Promise<string> {
  return describeSubjectApi(file);
}

/**
 * Build an edit prompt that inserts the subjects from one or more images into a
 * main scene image, given the main scene's description and a placement instruction.
 */
export async function buildImageInsertPrompt(
  file: File,
  sceneDescription: string,
  inserts: InsertImage[],
  changeRequest: string,
): Promise<string> {
  return buildInsertPromptApi({ file, sceneDescription, inserts, changeRequest });
}

export type { InsertImage };

/**
 * Process an image without uploading to Payload (for testing)
 */
export async function processImageOnly(
  file: File,
  altText: string = ''
): Promise<ProcessImageOnlyResponse> {
  return processImageOnlyApi({ file, altText });
}

export type FeaturedSocialImageRef =
  | { featuredAssetId: number }
  | { featuredMediaSetId: number };

export async function generateSocialImageFromFeatured(
  ref: FeaturedSocialImageRef,
  token: string
): Promise<GenerateSocialImageResponse> {
  return generateSocialImageApi({ ...ref, token });
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
