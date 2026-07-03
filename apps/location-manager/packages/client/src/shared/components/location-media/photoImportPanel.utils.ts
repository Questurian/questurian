import type { ImageVariantType } from "@questurian/lm-shared";
import { VARIANT_SPECS } from "@questurian/lm-shared";
import type { CropState } from "@client/shared/types/location-media.types";

export const PHOTO_IMPORT_VARIANT_TYPES: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];

export function buildCenterCropStates(
  imageWidth: number,
  imageHeight: number
): Record<ImageVariantType, CropState> {
  const states = {} as Record<ImageVariantType, CropState>;
  for (const type of PHOTO_IMPORT_VARIANT_TYPES) {
    const ratio = VARIANT_SPECS[type].ratio;
    const imageRatio = imageWidth / imageHeight;
    let cropW: number;
    let cropH: number;
    if (imageRatio > ratio) {
      cropH = imageHeight;
      cropW = cropH * ratio;
    } else {
      cropW = imageWidth;
      cropH = cropW / ratio;
    }
    const x = (imageWidth - cropW) / 2;
    const y = (imageHeight - cropH) / 2;
    states[type] = {
      variantType: type,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(cropW),
        height: Math.round(cropH),
      },
      completed: true,
    };
  }
  return states;
}

export function loadImageDimensions(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export function toImageApiPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const stripped = normalized
    .replace(/^\/+/, "")
    .replace(/^data\/images\//, "")
    .replace(/^packages\/server\/data\/images\//, "")
    .replace(/^apps\/location-manager\/packages\/server\/data\/images\//, "");
  return `/api/images/${stripped}`;
}

export function getFileNameFromPath(path: string, fallback: string): string {
  const fileName = path.split("/").pop();
  return fileName?.trim() ? fileName : fallback;
}
