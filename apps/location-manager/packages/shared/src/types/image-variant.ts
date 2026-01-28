/**
 * Multi-variant image system type definitions
 * Defines the structure for image variants with different aspect ratios
 */

/**
 * Supported image variant types for different use cases
 */
export type ImageVariantType = 'thumbnail' | 'square' | 'wide' | 'portrait' | 'hero';

/**
 * Aspect ratio specification for each variant type
 */
export interface AspectRatioSpec {
  ratio: number;        // Numerical ratio (e.g., 1.5 for 3:2)
  label: string;        // Display label (e.g., "3:2")
  width: number;        // Target width in pixels
  height: number;       // Target height in pixels
}

/**
 * Variant specifications lookup table
 * Maps each variant type to its aspect ratio and target dimensions
 */
export const VARIANT_SPECS: Record<ImageVariantType, AspectRatioSpec> = {
  thumbnail: { ratio: 3 / 2, label: '3:2', width: 1200, height: 800 },
  square: { ratio: 1, label: '1:1', width: 1080, height: 1080 },
  wide: { ratio: 16 / 9, label: '16:9', width: 1920, height: 1080 },
  portrait: { ratio: 4 / 5, label: '4:5', width: 1200, height: 1500 },
  hero: { ratio: 21 / 9, label: '21:9', width: 2100, height: 900 },
};

/**
 * Individual image variant with metadata
 */
export interface ImageVariant {
  type: ImageVariantType;
  aspectRatio: string;  // e.g., "3:2"
  dimensions: {
    width: number;
    height: number;
  };
  path: string;         // Relative file path
  size: number;         // File size in bytes
  format: string;       // 'jpeg', 'png', 'webp'
}

/**
 * Complete image set containing source image and all variants
 */
export interface ImageSet {
  id: string;  // Timestamp-based identifier
  sourceImage: {
    path: string;
    dimensions: { width: number; height: number };
    size: number;
    format: string;
  };
  variants: ImageVariant[];  // Array of 5 variants
  photographerCredit?: string | null;
  altText?: string;  // AI-generated alt text for the image set
  created_at: string;
}

/**
 * Crop parameters for generating a specific variant
 */
export interface VariantCropParams {
  variantType: ImageVariantType;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}
