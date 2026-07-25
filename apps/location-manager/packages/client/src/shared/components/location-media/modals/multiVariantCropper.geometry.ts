import type { Area } from "react-easy-crop";
import type { ImageVariantType } from "@questurian/lm-shared";
import type { CropState } from "@client/shared/types/location-media.types";

export const variantSequence: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'open_graph', 'editorial', 'portrait', 'hero'];
export const STRAIGHTEN_MIN = -20;
export const STRAIGHTEN_MAX = 20;
export const STRAIGHTEN_STEP = 0.1;

export function clampStraightenAngle(angle: number): number {
  return Math.min(STRAIGHTEN_MAX, Math.max(STRAIGHTEN_MIN, Number(angle.toFixed(1))));
}

export function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Dimensions of the axis-aligned bounding box after rotating a width×height
 * rectangle. Mirrors the `rotateSize` used in image-processing so auto-crop
 * areas land in the same coordinate space that `createCroppedImage` consumes.
 */
export function rotatedBoundingBox(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

/**
 * Largest centered rectangle of the target aspect ratio that fits inside a
 * width×height box. Matches react-easy-crop's default (`objectFit: contain`)
 * crop area at zoom 1 with the image centered, so a manually-cropped variant
 * and an auto-cropped one resolve to the same pixels.
 */
export function centeredCropArea(width: number, height: number, ratio: number): Area {
  let cropWidth = width;
  let cropHeight = width / ratio;

  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = height * ratio;
  }

  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  };
}

export function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

export function formatDegrees(angle: number): string {
  if (Math.abs(angle) < 0.05) {
    return "0°";
  }

  return `${angle > 0 ? "+" : ""}${angle.toFixed(1)}°`;
}

export function createInitialCropStates(): Record<ImageVariantType, CropState> {
  return {
    thumbnail: { variantType: 'thumbnail', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    square: { variantType: 'square', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    wide: { variantType: 'wide', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    open_graph: { variantType: 'open_graph', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    editorial: { variantType: 'editorial', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    portrait: { variantType: 'portrait', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
    hero: { variantType: 'hero', crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null, completed: false },
  };
}
