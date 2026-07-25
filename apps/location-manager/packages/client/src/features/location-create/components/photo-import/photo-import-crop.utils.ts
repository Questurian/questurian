import type { CropState, ImageVariantUploadFile } from "@client/shared/types/location-media.types";
import type { ImageVariantType, PhotoImportPhoto } from "@questurian/lm-shared";
import { VARIANT_SPECS } from "@questurian/lm-shared";
import type { PersistedSource } from "../../lib/add-flow-photo-session";
import type { CroppedPhotoSource } from "./photo-import-phase.types";

const ALL_VARIANT_TYPES: ImageVariantType[] = [
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
  const imageRatio = imageWidth / imageHeight;
  for (const type of ALL_VARIANT_TYPES) {
    const ratio = VARIANT_SPECS[type].ratio;
    let cropW: number;
    let cropH: number;
    if (imageRatio > ratio) {
      cropH = imageHeight;
      cropW = cropH * ratio;
    } else {
      cropW = imageWidth;
      cropH = cropW / ratio;
    }
    states[type] = {
      variantType: type,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: {
        x: Math.round((imageWidth - cropW) / 2),
        y: Math.round((imageHeight - cropH) / 2),
        width: Math.round(cropW),
        height: Math.round(cropH),
      },
      completed: true,
    };
  }
  return states;
}

export function loadImageDimensions(
  file: File
): Promise<{ url: string; width: number; height: number }> {
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

function fileFromPersisted(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/webp" });
}

export function persistedToCropped(persisted: PersistedSource): CroppedPhotoSource | null {
  if (persisted.variants.length === 0) return null;
  const variants: ImageVariantUploadFile[] = persisted.variants.map((variant) => ({
    type: variant.variantType,
    file: fileFromPersisted(variant.blob, variant.filename),
  }));

  // The session currently persists variants but not original source bytes.
  // Preserve the existing restored-session fallback by using the first variant
  // as the source artifact until the operator reopens the cropper.
  return {
    sourceName: persisted.sourceName,
    sourceFile: variants[0].file,
    variants,
    photographerCredit: persisted.credit ?? "",
  };
}

export function isSelectablePhoto(photo: PhotoImportPhoto): boolean {
  return photo.status === "new" || photo.status === "rejected";
}

export function defaultSelectedPhotos(photos: PhotoImportPhoto[]): Set<string> {
  return new Set(photos.filter((photo) => photo.status === "new").map((photo) => photo.name));
}
