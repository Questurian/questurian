/**
 * Multi-variant image system type definitions
 * Defines the structure for image variants with different aspect ratios
 */

/**
 * Supported image variant types for different use cases
 */
/**
 * Variant nomenclature is owned by Questura's `MEDIA_VARIANT_KEYS`. LM
 * conforms per ADR 0002 (`apps/questura/docs/adr/0002-...`); the prior
 * `'social'` literal has been renamed to `'open_graph'`.
 */
export type ImageVariantType =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'open_graph'
  | 'editorial'
  | 'portrait'
  | 'hero';

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
  open_graph: { ratio: 1200 / 630, label: '1.91:1', width: 1200, height: 630 },
  editorial: { ratio: 4 / 3, label: '4:3', width: 1600, height: 1200 },
  portrait: { ratio: 4 / 5, label: '4:5', width: 1200, height: 1500 },
  hero: { ratio: 21 / 9, label: '21:9', width: 2100, height: 900 },
};

/**
 * Pixel-rect crop region within the source image. Captured from the
 * react-easy-crop output (`croppedAreaPixels`) when an operator crops a
 * variant manually. Persisted on `ImageVariant` so the Questura
 * `from-source` pipeline can reproduce the exact crop server-side.
 */
export interface VariantCropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

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
  /**
   * Pixel-rect from the source image used to produce this variant. Optional
   * for backward compatibility with ImageSets uploaded before crop-region
   * persistence existed (those fall back to per-variant upload).
   */
  cropRegion?: VariantCropRegion;
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
  variants: ImageVariant[];  // Array of 7 variants
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
