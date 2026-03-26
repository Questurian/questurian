/**
 * Image processing utilities for cropping and resizing images
 */

import type { ImageVariantType } from "@questurian/lm-shared";
import { VARIANT_SPECS as VARIANT_SPECS_IMPORT } from "@questurian/lm-shared";
import type { CropData, TargetDimensions, CropState } from "@client/shared/types/location-media.types";

export type { CropData, TargetDimensions, CropState };

function createImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = imageSrc;
  });
}

function getRadianAngle(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const radians = getRadianAngle(rotation);

  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

/**
 * Creates a cropped image from a source image using canvas
 * @param imageSrc - Source image URL (object URL or data URL)
 * @param cropData - Crop coordinates in pixels
 * @param targetDimensions - Target output dimensions
 * @param fileName - Output file name
 * @returns Cropped File object
 */
export async function createCroppedImage(
  imageSrc: string,
  cropData: CropData,
  targetDimensions: TargetDimensions,
  fileName: string,
  rotation = 0
): Promise<File> {
  const image = await createImage(imageSrc);

  const canvas = document.createElement("canvas");
  const { width: rotatedWidth, height: rotatedHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  canvas.width = Math.round(rotatedWidth);
  canvas.height = Math.round(rotatedHeight);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = targetDimensions.width;
  outputCanvas.height = targetDimensions.height;

  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("Failed to get output canvas context");
  }

  outputCtx.drawImage(
    canvas,
    cropData.x,
    cropData.y,
    cropData.width,
    cropData.height,
    0,
    0,
    targetDimensions.width,
    targetDimensions.height
  );

  const fileExtension = fileName.split(".").pop()?.toLowerCase();
  const mimeType = getMimeType(fileExtension || "jpg");
  const quality = mimeType === "image/png" ? 1.0 : 0.95;

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create blob from canvas"));
        return;
      }

      resolve(new File([blob], fileName, { type: mimeType }));
    }, mimeType, quality);
  });
}

export async function createRotatedSourceImage(
  imageSrc: string,
  fileName: string,
  rotation: number
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const { width: rotatedWidth, height: rotatedHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  canvas.width = Math.round(rotatedWidth);
  canvas.height = Math.round(rotatedHeight);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const fileExtension = fileName.split(".").pop()?.toLowerCase();
  const mimeType = getMimeType(fileExtension || "jpg");
  const quality = mimeType === "image/png" ? 1.0 : 0.95;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create blob from canvas"));
        return;
      }

      resolve(new File([blob], fileName, { type: mimeType }));
    }, mimeType, quality);
  });
}

/**
 * Get MIME type from file extension
 */
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return mimeTypes[extension] || "image/jpeg";
}

/**
 * Generate filename for a specific variant
 */
function generateVariantFileName(originalName: string, variantType: ImageVariantType): string {
  const ext = originalName.split('.').pop() || 'jpg';
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  return `${baseName}_${variantType}.${ext}`;
}

/**
 * Create all variant images from crop states
 * @param imageSrc - Source image URL (object URL)
 * @param cropStates - Crop states for all variants
 * @param fileName - Original file name
 * @returns Array of variant files with their types
 */
export async function createMultiVariantImages(
  imageSrc: string,
  cropStates: Record<ImageVariantType, CropState>,
  fileName: string,
  rotation = 0
): Promise<{ type: ImageVariantType; file: File }[]> {
  // Process all variants in parallel for performance
  const variantPromises = Object.entries(cropStates).map(async ([type, state]) => {
    const variantType = type as ImageVariantType;
    const spec = VARIANT_SPECS_IMPORT[variantType];

    if (!state.croppedAreaPixels) {
      throw new Error(`Missing crop data for variant: ${variantType}`);
    }

    const croppedFile = await createCroppedImage(
      imageSrc,
      {
        x: state.croppedAreaPixels.x,
        y: state.croppedAreaPixels.y,
        width: state.croppedAreaPixels.width,
        height: state.croppedAreaPixels.height,
      },
      { width: spec.width, height: spec.height },
      generateVariantFileName(fileName, variantType),
      rotation
    );

    return { type: variantType, file: croppedFile };
  });

  // Wait for all variants to be processed
  const variants = await Promise.all(variantPromises);

  return variants;
}
