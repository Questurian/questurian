/**
 * Image processing utilities for cropping and resizing images
 */

import type { ImageVariantType } from "@questurian/lm-shared";
import { VARIANT_SPECS as VARIANT_SPECS_IMPORT } from "@questurian/lm-shared";
import type { CropData, TargetDimensions, CropState } from "../types/location-browse.types";

export type { CropData, TargetDimensions, CropState };

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
  fileName: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        // Create canvas with exact target dimensions
        const canvas = document.createElement("canvas");
        canvas.width = targetDimensions.width;
        canvas.height = targetDimensions.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw cropped and scaled image
        ctx.drawImage(
          image,
          cropData.x,               // Source x
          cropData.y,               // Source y
          cropData.width,           // Source width
          cropData.height,          // Source height
          0,                        // Destination x
          0,                        // Destination y
          targetDimensions.width,   // Destination width (scaled)
          targetDimensions.height   // Destination height (scaled)
        );

        // Determine file type and quality
        const fileExtension = fileName.split(".").pop()?.toLowerCase();
        const mimeType = getMimeType(fileExtension || "jpg");
        const quality = mimeType === "image/png" ? 1.0 : 0.95;

        // Convert canvas to Blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob from canvas"));
              return;
            }

            // Create File object
            const file = new File([blob], fileName, { type: mimeType });
            resolve(file);
          },
          mimeType,
          quality
        );
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    image.src = imageSrc;
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
  fileName: string
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
      generateVariantFileName(fileName, variantType)
    );

    return { type: variantType, file: croppedFile };
  });

  // Wait for all variants to be processed
  const variants = await Promise.all(variantPromises);

  return variants;
}
