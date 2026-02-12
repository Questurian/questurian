/**
 * Image processing utilities for cropping and resizing images
 * Adapted from Location Manager implementation
 */

import type { Area } from 'react-easy-crop';

export type ImageVariantType =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'portrait'
  | 'hero'
  | 'open_graph'
  | 'editorial';

export interface VariantSpec {
  width: number;
  height: number;
  ratio: number;
  label: string;
}

export const VARIANT_SPECS: Record<ImageVariantType, VariantSpec> = {
  thumbnail: { width: 1200, height: 800, ratio: 3 / 2, label: '3:2' },
  square: { width: 1080, height: 1080, ratio: 1, label: '1:1' },
  wide: { width: 1920, height: 1080, ratio: 16 / 9, label: '16:9' },
  portrait: { width: 1200, height: 1500, ratio: 4 / 5, label: '4:5' },
  hero: { width: 2100, height: 900, ratio: 21 / 9, label: '21:9' },
  open_graph: {
    width: 1200,
    height: 630,
    ratio: 1200 / 630,
    label: 'Open Graph (1.91:1)',
  },
  editorial: {
    width: 1600,
    height: 1200,
    ratio: 4 / 3,
    label: 'Editorial (4:3)',
  },
};

export const VARIANT_SEQUENCE: ImageVariantType[] = [
  'thumbnail',
  'square',
  'wide',
  'portrait',
  'hero',
  'open_graph',
  'editorial',
];

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropState {
  variantType: ImageVariantType;
  crop: { x: number; y: number };
  zoom: number;
  croppedAreaPixels: Area | null;
  completed: boolean;
}

export type CropStates = Record<ImageVariantType, CropState>;

function sanitizeFileNameBase(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'image';
}

/**
 * Calculate a centered default crop area for an image and target aspect ratio
 */
export function calculateDefaultCrop(
  imageWidth: number,
  imageHeight: number,
  targetRatio: number
): Area {
  const imageRatio = imageWidth / imageHeight;
  
  let width: number;
  let height: number;
  
  if (imageRatio > targetRatio) {
    // Image is wider than target - crop width
    height = imageHeight;
    width = height * targetRatio;
  } else {
    // Image is taller than target - crop height
    width = imageWidth;
    height = width / targetRatio;
  }
  
  // Center the crop
  const x = (imageWidth - width) / 2;
  const y = (imageHeight - height) / 2;
  
  return { x, y, width, height };
}

/**
 * Creates a cropped image from a source image using canvas
 */
export async function createCroppedImage(
  imageSrc: string,
  cropData: CropData,
  targetDimensions: { width: number; height: number },
  fileName: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetDimensions.width;
        canvas.height = targetDimensions.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw cropped and scaled image
        ctx.drawImage(
          image,
          cropData.x,
          cropData.y,
          cropData.width,
          cropData.height,
          0,
          0,
          targetDimensions.width,
          targetDimensions.height
        );

        // Convert to WebP for consistency
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }

            const webpFileName = fileName.replace(/\.[^/.]+$/, '') + '.webp';
            const file = new File([blob], webpFileName, { type: 'image/webp' });
            resolve(file);
          },
          'image/webp',
          0.85
        );
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    image.src = imageSrc;
  });
}

/**
 * Generate filename for a specific variant
 */
function generateVariantFileName(
  originalName: string,
  variantType: ImageVariantType,
  fileNamePrefix?: string
): string {
  const sourceBaseName = fileNamePrefix?.trim()
    ? fileNamePrefix
    : originalName.replace(/\.[^/.]+$/, '');
  const baseName = sanitizeFileNameBase(sourceBaseName);
  return `${baseName}_${variantType}.webp`;
}

/**
 * Create all variant images from crop states
 */
export async function createMultiVariantImages(
  imageSrc: string,
  cropStates: CropStates,
  fileName: string,
  fileNamePrefix?: string
): Promise<{ type: ImageVariantType; file: File }[]> {
  const variantPromises = Object.entries(cropStates).map(async ([type, state]) => {
    const variantType = type as ImageVariantType;
    const spec = VARIANT_SPECS[variantType];

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
      generateVariantFileName(fileName, variantType, fileNamePrefix)
    );

    return { type: variantType, file: croppedFile };
  });

  return Promise.all(variantPromises);
}

/**
 * Initialize default crop states for all variants with centered crops
 */
export function initializeCropStates(imageWidth?: number, imageHeight?: number): CropStates {
  const states: CropStates = {
    thumbnail: { variantType: 'thumbnail', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    square: { variantType: 'square', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    wide: { variantType: 'wide', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    portrait: { variantType: 'portrait', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    hero: { variantType: 'hero', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    open_graph: { variantType: 'open_graph', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    editorial: { variantType: 'editorial', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
  };

  // If we have image dimensions, calculate default centered crops
  if (imageWidth && imageHeight) {
    VARIANT_SEQUENCE.forEach(type => {
      const spec = VARIANT_SPECS[type];
      states[type].croppedAreaPixels = calculateDefaultCrop(imageWidth, imageHeight, spec.ratio);
      states[type].completed = true;
    });
  }

  return states;
}

/**
 * Load an image and return its dimensions
 */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Validate if an image meets minimum resolution requirements
 */
export async function validateImageResolution(
  file: File,
  minWidth: number,
  minHeight: number
): Promise<{ valid: boolean; error?: string; dimensions?: { width: number; height: number } }> {
  try {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    const dimensions = { width: img.naturalWidth, height: img.naturalHeight };

    if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) {
      return {
        valid: false,
        error: `Image resolution too low. Minimum: ${minWidth}×${minHeight}px, Got: ${img.naturalWidth}×${img.naturalHeight}px`,
        dimensions,
      };
    }

    return { valid: true, dimensions };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to validate image',
    };
  }
}
